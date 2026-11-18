import { test, expect, type Download } from '@playwright/test';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { openTestEnvironment } from '../../scripts/test-environment';
import { syntheticEnrollmentValidity } from '../../scripts/enrollment-fixture';
import { subsequentFixture } from '../../scripts/subsequent-declaration-fixture';

for (const purpose of ['PREVIEW', 'SCHOOL'] as const)
  for (const mode of ['INTEGRADO', 'SUBSEQUENTE'] as const) {
    test(`aluno ${mode} ${purpose} gera no modal, recupera resposta perdida e abre/baixa o original sem nova emissão`, async ({
      page,
    }, info) => {
      const previousMode = process.env.DECLARATION_ISSUANCE_MODE;
      process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
      if (purpose === 'SCHOOL')
        process.env.DECLARATION_ISSUANCE_MODE = 'school';
      else delete process.env.DECLARATION_ISSUANCE_MODE;
      const env = await openTestEnvironment({ http: true });
      const { db, base } = env;
      let studentId: string | undefined;
      const errors: string[] = [],
        keys: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        const student = await db.student.create({
          data: {
            fullName: 'Pessoa fictícia ' + mode,
            birthDate: new Date('2000-01-01'),
            schoolRegistration: randomBytes(6).toString('hex'),
            details: {
              create: {
                parentOne: 'Filiação fictícia privada',
                parentageSource: 'SCHOOL_RECORD',
              },
            },
          },
        });
        studentId = student.id;
        const account = await db.account.create({
          data: {
            studentId,
            email: randomUUID() + '@example.invalid',
            passwordHash: 'ficticio',
            role: 'student',
            status: 'active',
          },
        });
        let enrollmentId: string;
        if (mode === 'INTEGRADO') {
          const enrollment = await db.enrollment.create({
            data: {
              studentId,
              mode,
              className: '2A DS fictícia',
              grade: 2,
              courseLabel: 'DS',
              ...syntheticEnrollmentValidity(),
            },
          });
          enrollmentId = enrollment.id;
        } else {
          const f = subsequentFixture('DS', 2);
          await db.courseOffering.create({
            data: {
              id: f.enrollment.offeringId,
              label: f.schedule.label,
              courseLabel: 'DS',
              calendars: {
                create: {
                  revision: 1,
                  schedule: f.schedule,
                  createdById: account.id,
                },
              },
            },
          });

          const { offering: ignored, ...fields } = f.enrollment;
          void ignored;
          const enrollment = await db.enrollment.create({
            data: { ...fields, studentId },
          });
          enrollmentId = enrollment.id;
        }
        const token = randomBytes(32).toString('base64url');
        await db.session.create({
          data: {
            accountId: account.id,
            tokenHash: createHash('sha256').update(token).digest('hex'),
            expiresAt: new Date(Date.now() + 600000),
          },
        });
        await page
          .context()
          .addCookies([
            { name: 'ete_portal_session', value: token, url: base },
          ]);
        await page.goto(base + '/declaracao');
        if (purpose === 'SCHOOL')
          await expect(
            page.getByText(
              /Ambiente de teste|documentos gerados ainda não têm validade/i,
            ),
          ).toHaveCount(0);
        const generate = page.getByRole('button', {
          name: 'Gerar declaração',
          exact: true,
        });
        await expect(
          page.getByText('Nenhuma declaração ainda', { exact: true }),
        ).toBeVisible();
        await generate.click();
        const dialog = page.getByRole('dialog', { name: 'Onde você nasceu?' });
        await expect(dialog).toBeVisible();
        await page.getByLabel('Estado de nascimento (UF)').selectOption('PE');
        await expect(
          page
            .getByLabel('Município de nascimento')
            .getByRole('option', { name: 'Recife', exact: true }),
        ).toHaveCount(1);
        await page
          .getByLabel('Município de nascimento')
          .selectOption('2611606');
        await page
          .getByRole('checkbox', {
            name: 'Confirmo que este é meu local de nascimento.',
          })
          .check();
        let loseResponse = mode === 'INTEGRADO';
        await page.route('**/api/declaracao/solicitacoes', async (route) => {
          if (route.request().method() !== 'POST') return route.continue();
          keys.push(route.request().postDataJSON().requestKey);
          if (loseResponse) {
            loseResponse = false;
            const response = await route.fetch();
            expect(response.status()).toBe(201);
            return route.abort('failed');
          }
          return route.continue();
        });
        await dialog
          .getByRole('button', { name: 'Gerar declaração', exact: true })
          .click();
        if (mode === 'INTEGRADO') {
          await expect(dialog.getByRole('alert')).not.toBeEmpty();
          await expect(
            dialog.getByRole('button', {
              name: 'Gerar declaração',
              exact: true,
            }),
          ).toBeEnabled();
          await dialog
            .getByRole('button', { name: 'Voltar', exact: true })
            .click();
          const another = await page.request.post(
            base + '/api/declaracao/solicitacoes',
            {
              headers: { Origin: base },
              data: { enrollmentId, requestKey: randomUUID() },
            },
          );
          expect(another.status()).toBe(201);
          await page
            .getByRole('button', { name: 'Atualizar lista', exact: true })
            .click();
          await expect(
            page.getByText('Disponível para baixar', { exact: true }),
          ).toHaveCount(1);
          await generate.click();
          await dialog
            .getByRole('button', { name: 'Gerar declaração', exact: true })
            .click();
          await expect.poll(() => keys.length).toBe(2);
          expect(keys[0]).toBe(keys[1]);
        }
        await expect(dialog).not.toBeVisible();
        await expect(
          page.getByText('Disponível para baixar', { exact: true }),
        ).toBeVisible();
        await expect(
          page
            .locator('.request-row')
            .first()
            .getByText('Disponível para baixar', { exact: true }),
        ).toBeVisible();
        const records = await db.declarationDocument.findMany({
          where: { studentId },
          include: { archive: true },
          orderBy: { createdAt: 'desc' },
        });
        const expectedCount = mode === 'INTEGRADO' ? 2 : 1;
        expect(records).toHaveLength(expectedCount);
        expect(
          await db.declarationRequest.count({ where: { studentId } }),
        ).toBe(expectedCount);
        const details = await db.studentDetails.findUniqueOrThrow({
          where: { studentId },
        });
        expect(details.birthCity).toBe('Recife');
        expect(details.birthState).toBe('PE');
        expect(details.birthplaceSource).toBe('STUDENT_DECLARATION');
        const snapshot = records[0].snapshot as {
          body: string;
          mode: string;
          testOnly: boolean;
        };
        expect(snapshot.testOnly).toBe(purpose !== 'SCHOOL');
        expect(snapshot.mode).toBe(mode);
        expect(snapshot.body).toContain('Recife');
        if (mode === 'INTEGRADO') expect(snapshot.body).toContain('100%');
        else {
          expect(snapshot.body).toContain('2º módulo');
          expect(snapshot.body).not.toContain('frequência');
        }
        const downloadEvent = page.waitForEvent('download');
        await page
          .getByRole('button', { name: 'Baixar', exact: true })
          .first()
          .click();
        const download = await downloadEvent;
        expect(download.suggestedFilename()).toBe('declaracao-vinculo.pdf');
        expect(await readFile((await download.path())!)).toEqual(
          Buffer.from(records[0].archive!.bytes),
        );
        await expect(
          page.getByRole('button', { name: 'Abrir', exact: true }).first(),
        ).toBeEnabled();
        // Headless Shell salva PDFs; navegadores com visualizador abrem o mesmo blob.
        const openedDownload = new Promise<Download>((resolve) =>
          page.context().once('page', (tab) => tab.once('download', resolve)),
        );
        const popupEvent = page.waitForEvent('popup');
        await page
          .getByRole('button', { name: 'Abrir', exact: true })
          .first()
          .click();
        const popup = await popupEvent;
        const opened = await Promise.race([
          popup
            .waitForURL(/^blob:/)
            .then(() => ({ kind: 'viewer' as const }))
            .catch((error) => {
              if (String(error).includes('net::ERR_ABORTED'))
                return openedDownload.then((download) => ({
                  kind: 'download' as const,
                  download,
                }));
              throw error;
            }),
          openedDownload.then((download) => ({
            kind: 'download' as const,
            download,
          })),
        ]);
        if (opened.kind === 'download')
          expect(await readFile((await opened.download.path())!)).toEqual(
            Buffer.from(records[0].archive!.bytes),
          );
        expect(await popup.evaluate(() => window.opener === null)).toBe(true);
        await popup.close();
        expect(
          await db.declarationDocument.count({ where: { studentId } }),
        ).toBe(expectedCount);
        for (const width of [320, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          await page.screenshot({
            path: info.outputPath(`emissao-${mode}-${width}.png`),
            fullPage: true,
          });
        }
        // Falha na atualização mantém a lista e permite recuperar sem reemitir.
        await page.route('**/api/declaracao/solicitacoes', (route) =>
          route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Indisponibilidade fictícia. Tente novamente.',
            }),
          }),
        );
        await page
          .getByRole('button', { name: 'Atualizar lista', exact: true })
          .click();
        await expect(
          page
            .getByRole('region', { name: 'Declaração de vínculo', exact: true })
            .getByRole('alert'),
        ).toContainText('Indisponibilidade fictícia');
        await expect(
          page.getByRole('button', { name: 'Baixar', exact: true }).first(),
        ).toBeEnabled();
        await page.unroute('**/api/declaracao/solicitacoes');
        await page
          .getByRole('button', { name: 'Atualizar lista', exact: true })
          .click();
        await expect(
          page.getByText('Lista atualizada.', { exact: true }),
        ).toBeVisible();
        expect(
          await db.declarationDocument.count({ where: { studentId } }),
        ).toBe(expectedCount);
        if (purpose === 'SCHOOL') {
          const verification = await page.context().browser()!.newContext();
          const publicPage = await verification.newPage();
          try {
            await publicPage.goto(base + '/validar/' + records[0].publicCode);
            await expect(
              publicPage.getByRole('heading', {
                name: 'Declaração válida',
                exact: true,
              }),
            ).toBeVisible();
            await expect(
              publicPage.getByText(
                /Ambiente de teste|Arquivo de demonstração/i,
              ),
            ).toHaveCount(0);
            const publicResponse = await verification.request.post(
              base + '/api/documentos/verificacao',
              {
                headers: { Origin: base },
                data: { code: records[0].publicCode },
              },
            );
            expect(publicResponse.status()).toBe(200);
            expect((await publicResponse.json()).testOnly).toBe(false);
            await publicPage.screenshot({
              path: info.outputPath(`verificacao-escolar-${mode}.png`),
              fullPage: true,
            });
            const forbidden = await page.request.post(
              base + '/api/secretaria/documentos/alteracoes',
              {
                headers: { Origin: base },
                data: {
                  documentId: records[0].id,
                  action: 'CANCELLED',
                  reason: 'Tentativa fictícia',
                  confirmed: true,
                },
              },
            );
            expect(forbidden.status()).toBe(403);
            const forged = await page.request.post(
              base + '/api/declaracao/solicitacoes',
              {
                headers: { Origin: base },
                data: {
                  enrollmentId,
                  requestKey: randomUUID(),
                  testOnly: false,
                  role: 'secretary',
                },
              },
            );
            expect(forged.status()).toBe(422);
            const staff = await db.student.create({
              data: {
                fullName: 'Responsável fictício',
                birthDate: new Date('2000-01-01'),
                account: {
                  create: {
                    email: randomUUID() + '@example.invalid',
                    passwordHash: 'fixture',
                    role: 'secretary',
                    status: 'active',
                  },
                },
              },
              include: { account: true },
            });

            const staffContext = await page.context().browser()!.newContext();
            try {
              const staffToken = randomBytes(32).toString('base64url');
              await db.session.create({
                data: {
                  accountId: staff.account!.id,
                  tokenHash: createHash('sha256')
                    .update(staffToken)
                    .digest('hex'),
                  expiresAt: new Date(Date.now() + 600000),
                },
              });
              await staffContext.addCookies([
                { name: 'ete_portal_session', value: staffToken, url: base },
              ]);
              const legacy = await staffContext.request.post(
                base + '/api/secretaria/declaracao',
                { headers: { Origin: base }, data: {} },
              );
              expect(legacy.status()).toBe(410);
              const another = await page.request.post(
                base + '/api/declaracao/solicitacoes',
                {
                  headers: { Origin: base },
                  data: { enrollmentId, requestKey: randomUUID() },
                },
              );
              expect(another.status()).toBe(201);
              const current =
                await db.declarationCurrentIssue.findUniqueOrThrow({
                  where: {
                    enrollmentId_documentType: {
                      enrollmentId,
                      documentType: 'DECLARACAO_VINCULO',
                    },
                  },
                  include: { document: true },
                });
              await publicPage
                .getByRole('button', {
                  name: 'Atualizar consulta',
                  exact: true,
                })
                .click();
              await expect(
                publicPage.getByRole('heading', {
                  name: 'Declaração substituída',
                  exact: true,
                }),
              ).toBeVisible();
              await publicPage.goto(
                base + '/validar/' + current.document.publicCode,
              );
              await expect(
                publicPage.getByRole('heading', {
                  name: 'Declaração válida',
                  exact: true,
                }),
              ).toBeVisible();
              const cancel = await staffContext.request.post(
                base + '/api/secretaria/documentos/alteracoes',
                {
                  headers: { Origin: base },
                  data: {
                    documentId: current.documentId,
                    action: 'CANCELLED',
                    reason: 'Cancelamento fictício conferido.',
                    confirmed: true,
                  },
                },
              );
              expect(cancel.status()).toBe(201);
              await publicPage
                .getByRole('button', {
                  name: 'Atualizar consulta',
                  exact: true,
                })
                .click();
              await expect(
                publicPage.getByRole('heading', {
                  name: 'Declaração cancelada',
                  exact: true,
                }),
              ).toBeVisible();
              const original = await page.request.post(
                base + '/api/declaracao/arquivo',
                {
                  headers: { Origin: base },
                  data: { documentId: records[0].id },
                },
              );
              expect(original.status()).toBe(200);
              expect(await original.body()).toEqual(
                Buffer.from(records[0].archive!.bytes),
              );
            } finally {
              await staffContext.close();
            }
          } finally {
            await verification.close();
          }
        }
        expect(errors).toEqual([]);
        expect(enrollmentId).toBeTruthy();
      } finally {
        await env.close();
        delete process.env.DECLARATION_REGISTRY_PREVIEW;
        if (previousMode === undefined)
          delete process.env.DECLARATION_ISSUANCE_MODE;
        else process.env.DECLARATION_ISSUANCE_MODE = previousMode;
      }
    });
  }
