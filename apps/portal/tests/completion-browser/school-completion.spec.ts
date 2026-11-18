import { test, expect } from '@playwright/test';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { openTestEnvironment } from '../../scripts/test-environment';
import { schoolClassSchedule } from '../../src/lib/school-class-input';
for (const mode of ['INTEGRADO', 'SUBSEQUENTE'] as const)
  test(`conclusão ${mode}: seleção explícita, resposta perdida, PDF e conta preservados`, async ({
    page,
    browser,
  }, info) => {
    const old = process.env.DECLARATION_REGISTRY_PREVIEW;
    process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
    const env = await openTestEnvironment({ http: true }),
      { db, base } = env,
      studentContext = await browser.newContext();
    const errors: string[] = [];
    let phase = 'fixtures';
    page.on('pageerror', (e) => errors.push(e.name));
    try {
      async function person(role: 'student' | 'secretary') {
        const s = await db.student.create({
          data: {
            fullName: 'Pessoa fictícia concluinte ' + role + ' ' + mode,
            schoolRegistration: randomBytes(5).toString('hex'),
            birthDate: new Date('2000-01-01'),
            details: {
              create: {
                parentOne: 'FILIAÇÃO FICTÍCIA',
                parentageSource: 'SCHOOL_RECORD',
                birthCity: 'Recife',
                birthState: 'PE',
                birthCountry: 'BR',
                birthplaceSource: 'SCHOOL_RECORD',
              },
            },
          },
        });
        const a = await db.account.create({
            data: {
              studentId: s.id,
              role,
              status: 'active',
              email: randomUUID() + '@example.invalid',
              passwordHash: 'ficticio',
            },
          }),
          token = randomBytes(32).toString('base64url');
        await db.session.create({
          data: {
            accountId: a.id,
            tokenHash: createHash('sha256').update(token).digest('hex'),
            expiresAt: new Date(Date.now() + 600000),
          },
        });
        return { s, a, token };
      }
      const staff = await person('secretary'),
        pupil = await person('student'),
        classmate = await person('student');
      await page
        .context()
        .addCookies([
          { name: 'ete_portal_session', value: staff.token, url: base },
        ]);
      await studentContext.addCookies([
        { name: 'ete_portal_session', value: pupil.token, url: base },
      ]);
      const schedule = schoolClassSchedule('DS', 3, '2026.2', 'STDSIN3U');
      const offering =
        mode === 'SUBSEQUENTE'
          ? await db.courseOffering.create({
              data: {
                label: schedule.label,
                courseLabel: 'DS',
                calendars: {
                  create: { revision: 1, schedule, createdById: staff.a.id },
                },
              },
            })
          : null;
      const data = {
        mode,
        courseLabel: 'DS',
        grade: mode === 'INTEGRADO' ? 3 : null,
        moduleNumber: mode === 'SUBSEQUENTE' ? 3 : null,
        className: mode === 'INTEGRADO' ? '3A DS' : 'STDSIN3U',
        schoolYear: 2026,
        periodLabel: mode === 'INTEGRADO' ? '2026' : '2026.2',
        status: 'ACTIVE' as const,
        reviewedAt: new Date(),
        reviewedById: staff.a.id,
        progressionHeld: false,
        validFrom: new Date(mode === 'INTEGRADO' ? '2026-02-01' : '2026-08-01'),
        validUntil: new Date('2026-12-31'),
        ...(offering
          ? { offeringId: offering.id, calendarModule: 3, calendarRevision: 1 }
          : {}),
      };
      const row = await db.enrollment.create({
          data: { ...data, studentId: pupil.s.id },
        }),
        other = await db.enrollment.create({
          data: { ...data, studentId: classmate.s.id },
        });
      phase = 'documento anterior';
      const issue = await studentContext.request.post(
        base + '/api/declaracao/solicitacoes',
        {
          headers: { Origin: base },
          data: { enrollmentId: row.id, requestKey: randomUUID() },
        },
      );
      expect(issue.status()).toBe(201);
      const doc = (await issue.json()).request.document.id;
      const bytes = await studentContext.request.post(
        base + '/api/declaracao/arquivo',
        { headers: { Origin: base }, data: { documentId: doc } },
      );
      expect(bytes.status()).toBe(200);
      const original = await bytes.body();
      phase = 'turma e seleção';
      await page.goto(base + '/secretaria/alunos');
      if (mode === 'SUBSEQUENTE')
        await page
          .getByRole('button', { name: 'Subsequente', exact: true })
          .click();
      await page
        .getByRole('button', {
          name: `Ver alunos da turma ${row.className} · ${row.periodLabel}`,
          exact: true,
        })
        .click();
      await page
        .getByRole('button', {
          name: 'Encerrar vínculos de concluintes desta turma',
          exact: true,
        })
        .click();
      const dialog = page.getByRole('dialog', {
        name: 'Encerrar vínculos dos concluintes',
        exact: true,
      });
      await dialog
        .getByRole('checkbox', {
          name: new RegExp(pupil.s.schoolRegistration!),
        })
        .check();
      await dialog
        .getByLabel('Motivo do encerramento')
        .fill('Conclusão fictícia conferida nos registros escolares.');
      const wait = (operation: string) =>
        page.waitForResponse(
          (r) =>
            new URL(r.url()).pathname === '/api/secretaria/alunos/conclusao' &&
            r.request().postDataJSON()?.operation === operation,
        );
      phase = 'prévia cancelada sem substituir consulta nova';
      let releasePreview: () => void = () => {},
        previewStarted = false;
      const delayed = new Promise<void>((resolve) => {
        releasePreview = resolve;
      });
      await page.route(
        '**/api/secretaria/alunos/conclusao',
        async (route) => {
          if (route.request().postDataJSON()?.operation === 'preview') {
            const actual = await route.fetch();
            previewStarted = true;
            await delayed;
            await route.fulfill({ response: actual }).catch(() => {});
          } else await route.continue();
        },
        { times: 1 },
      );
      try {
        await dialog
          .getByRole('button', {
            name: 'Conferir encerramento dos selecionados',
            exact: true,
          })
          .click();
        await expect.poll(() => previewStarted).toBe(true);
        await dialog
          .getByRole('button', {
            name: 'Voltar aos alunos da turma',
            exact: true,
          })
          .click();
        await page
          .getByRole('button', {
            name: 'Encerrar vínculos de concluintes desta turma',
            exact: true,
          })
          .click();
        await expect(
          dialog.getByRole('checkbox', {
            name: new RegExp(pupil.s.schoolRegistration!),
          }),
        ).toBeVisible();
      } finally {
        releasePreview();
      }
      await expect(
        dialog.getByRole('heading', {
          name: 'Confira os vínculos que serão encerrados',
          exact: true,
        }),
      ).toHaveCount(0);
      await dialog
        .getByRole('checkbox', {
          name: new RegExp(pupil.s.schoolRegistration!),
        })
        .check();
      await dialog
        .getByLabel('Motivo do encerramento')
        .fill('Conclusão fictícia conferida nos registros escolares.');
      let response = wait('preview');
      await dialog
        .getByRole('button', {
          name: 'Conferir encerramento dos selecionados',
          exact: true,
        })
        .click();
      const preview = await response;
      expect(preview.status()).toBe(200);
      const query = preview.request().postDataJSON();
      expect(
        (
          await studentContext.request.post(
            base + '/api/secretaria/alunos/conclusao',
            { headers: { Origin: base }, data: query },
          )
        ).status(),
      ).toBe(403);
      expect(
        (
          await page.request.post(base + '/api/secretaria/alunos/conclusao', {
            headers: { Origin: 'https://example.invalid' },
            data: query,
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await page.request.post(base + '/api/secretaria/alunos/conclusao', {
            headers: { Origin: base },
            data: { ...query, role: 'secretary' },
          })
        ).status(),
      ).toBe(400);
      await expect(
        dialog.getByRole('heading', {
          name: 'Confira os vínculos que serão encerrados',
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        dialog.getByRole('button', {
          name: 'Confirmar encerramento',
          exact: true,
        }),
      ).toBeDisabled();
      await expect(dialog.getByLabel('Motivo do encerramento')).toHaveCSS(
        'resize',
        'none',
      );
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        if (width === 320) {
          await expect(dialog.getByLabel('Motivo do encerramento')).toHaveCSS(
            'font-size',
            '16px',
          );
          expect(
            await dialog
              .getByLabel('Motivo do encerramento')
              .evaluate((e) => e.getBoundingClientRect().width),
          ).toBeGreaterThan(200);
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(
          await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`conclusao-${mode}-${width}.png`),
          fullPage: true,
        });
      }
      await dialog
        .getByRole('checkbox', {
          name: 'Conferi a conclusão dos alunos selecionados e quero encerrar somente estes vínculos.',
          exact: true,
        })
        .check();
      phase = 'confirmação';
      const sent: unknown[] = [];
      page.on('request', (r) => {
        if (
          new URL(r.url()).pathname === '/api/secretaria/alunos/conclusao' &&
          r.method() === 'POST' &&
          r.postDataJSON()?.operation === 'confirm'
        )
          sent.push(r.postDataJSON());
      });
      if (mode === 'INTEGRADO')
        await page.route(
          '**/api/secretaria/alunos/conclusao',
          async (route) => {
            if (route.request().postDataJSON()?.operation === 'confirm') {
              await route.fetch();
              await route.abort('failed');
            } else await route.continue();
          },
          { times: 1 },
        );
      if (mode === 'SUBSEQUENTE') response = wait('confirm');
      await dialog
        .getByRole('button', { name: 'Confirmar encerramento', exact: true })
        .click();
      if (mode === 'INTEGRADO') {
        await expect(
          dialog.getByRole('button', {
            name: 'Repetir confirmação',
            exact: true,
          }),
        ).toBeVisible();
        response = wait('confirm');
        await dialog
          .getByRole('button', { name: 'Repetir confirmação', exact: true })
          .click();
      }
      expect((await response).status()).toBe(200);
      if (mode === 'INTEGRADO') expect(sent[0]).toEqual(sent[1]);
      await expect(dialog).not.toBeVisible();
      expect(
        (await db.enrollment.findUniqueOrThrow({ where: { id: row.id } }))
          .status,
      ).toBe('ENDED');
      expect(
        (await db.enrollment.findUniqueOrThrow({ where: { id: other.id } }))
          .status,
      ).toBe('ACTIVE');
      const refusal = await studentContext.request.post(
        base + '/api/declaracao/solicitacoes',
        {
          headers: { Origin: base },
          data: { enrollmentId: row.id, requestKey: randomUUID() },
        },
      );
      expect(refusal.status()).toBe(422);
      const download = await studentContext.request.post(
        base + '/api/declaracao/arquivo',
        { headers: { Origin: base }, data: { documentId: doc } },
      );
      expect(download.status()).toBe(200);
      expect(await download.body()).toEqual(original);
      expect((await studentContext.request.get(base + '/')).status()).toBe(200);
      phase = 'área do aluno depois do encerramento';
      const ownPage = await studentContext.newPage();
      ownPage.on('pageerror', (e) => errors.push(e.name));
      await ownPage.goto(base + '/declaracao');
      await expect(
        ownPage.getByRole('button', { name: 'Gerar declaração', exact: true }),
      ).toBeDisabled();
      await expect(
        ownPage.getByText('Seus vínculos estão encerrados.', { exact: true }),
      ).toBeVisible();
      await ownPage.setViewportSize({ width: 320, height: 900 });
      expect(
        await ownPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await ownPage.screenshot({
        path: info.outputPath(`aluno-encerrado-${mode}-320.png`),
        fullPage: true,
      });
      const nextName = mode === 'INTEGRADO' ? '3B ADM' : 'STADMN3U';
      const nextSchedule = schoolClassSchedule('ADM', 3, '2026.2', nextName);
      const nextOffering =
        mode === 'SUBSEQUENTE'
          ? await db.courseOffering.create({
              data: {
                label: nextSchedule.label,
                courseLabel: 'ADM',
                calendars: {
                  create: {
                    revision: 1,
                    schedule: nextSchedule,
                    createdById: staff.a.id,
                  },
                },
              },
            })
          : null;
      const independent = await db.enrollment.create({
        data: {
          ...data,
          studentId: pupil.s.id,
          courseLabel: 'ADM',
          className: nextName,
          createdAt: new Date('2025-01-01'),
          offeringId: nextOffering?.id ?? null,
          calendarModule: nextOffering ? 3 : null,
          calendarRevision: nextOffering ? 1 : null,
        },
      });
      await ownPage.reload();
      await expect(
        ownPage.getByRole('button', { name: 'Gerar declaração', exact: true }),
      ).toBeEnabled();
      await expect(ownPage.getByText(nextName, { exact: true })).toBeVisible();
      expect(
        (
          await studentContext.request.post(
            base + '/api/declaracao/solicitacoes',
            {
              headers: { Origin: base },
              data: { enrollmentId: independent.id, requestKey: randomUUID() },
            },
          )
        ).status(),
      ).toBe(201);
      expect(
        await db.declarationDocumentAction.count({
          where: { documentId: doc },
        }),
      ).toBe(0);
      await ownPage.close();
      phase = 'correção auditada';
      await page.goto(base + '/secretaria/alunos');
      if (mode === 'SUBSEQUENTE')
        await page
          .getByRole('button', { name: 'Subsequente', exact: true })
          .click();
      await page
        .getByRole('button', {
          name: `Ver alunos da turma ${row.className} · ${row.periodLabel}`,
          exact: true,
        })
        .click();
      await page
        .getByRole('listitem')
        .filter({ hasText: pupil.s.schoolRegistration! })
        .getByRole('button', { name: 'Ver aluno e bloqueios', exact: true })
        .click();
      await page
        .getByRole('button', {
          name: `Conferir situação escolar de ${row.className}`,
          exact: true,
        })
        .click();
      await page
        .getByRole('button', {
          name: 'Corrigir encerramento por engano',
          exact: true,
        })
        .click();
      const correction = page.getByRole('dialog', {
        name: 'Corrigir encerramento por engano',
        exact: true,
      });
      await correction
        .getByLabel('Motivo da alteração')
        .fill('Encerramento fictício feito por engano.');
      await correction.getByRole('checkbox').check();
      const fixed = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname ===
            '/api/secretaria/alunos/situacao-escolar' &&
          r.request().postDataJSON()?.operation === 'change',
      );
      await correction
        .getByRole('button', {
          name: 'Confirmar alteração escolar',
          exact: true,
        })
        .click();
      expect((await fixed).status()).toBe(200);
      await expect(
        page
          .getByRole('region', { name: 'Situação escolar', exact: true })
          .getByText('Matrícula a conferir', { exact: true }),
      ).toBeVisible();
      expect(
        await db.schoolAcademicEvent.count({
          where: { enrollmentId: row.id, kind: 'END' },
        }),
      ).toBe(1);
      expect(
        await db.schoolAcademicEvent.count({
          where: { enrollmentId: row.id, kind: 'REOPEN' },
        }),
      ).toBe(1);
      expect(errors).toEqual([]);
    } catch (e) {
      info.annotations.push({ type: 'phase', description: phase });
      throw e;
    } finally {
      await studentContext.close();
      await env.close();
      if (old === undefined) delete process.env.DECLARATION_REGISTRY_PREVIEW;
      else process.env.DECLARATION_REGISTRY_PREVIEW = old;
    }
  });
