import { test, expect, type Page } from '@playwright/test';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { openTestEnvironment } from '../../scripts/test-environment';
import { schoolClassSchedule } from '../../src/lib/school-class-input';
for (const mode of ['INTEGRADO', 'SUBSEQUENTE'] as const) {
  test(`situação escolar ${mode}: conferência, repetência, resposta perdida e documentos preservados`, async ({
    page,
    browser,
  }, info) => {
    process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
    const env = await openTestEnvironment({ http: true }),
      { db, base } = env;
    const errors: string[] = [],
      keys: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let phase = 'fixtures';
    let studentPage: Page | undefined;
    const responses: { status: number; error?: string }[] = [];
    const studentContext = await browser.newContext();
    try {
      async function person(role: 'student' | 'secretary') {
        const s = await db.student.create({
          data: {
            fullName: `Pessoa fictícia acadêmica ${role} ${mode}`,
            schoolRegistration: randomBytes(6).toString('hex'),
            birthDate: new Date('2000-01-01'),
            ...(role === 'student'
              ? {
                  details: {
                    create: {
                      parentOne: 'FILIAÇÃO FICTÍCIA',
                      parentageSource: 'SCHOOL_RECORD',
                    },
                  },
                }
              : {}),
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
        });
        const token = randomBytes(32).toString('base64url');
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
        student = await person('student');
      const className = mode === 'INTEGRADO' ? '1A DS' : 'STDSIN1U';
      const course =
        mode === 'SUBSEQUENTE'
          ? await db.courseOffering.create({
              data: {
                label: className,
                courseLabel: 'DS',
                calendars: {
                  create: {
                    revision: 1,
                    schedule: schoolClassSchedule('DS', 1, '2026.2', className),
                    createdById: staff.a.id,
                  },
                },
              },
            })
          : null;
      const enrollment = await db.enrollment.create({
        data: {
          studentId: student.s.id,
          mode,
          className,
          courseLabel: 'DS',
          grade: mode === 'INTEGRADO' ? 1 : null,
          moduleNumber: mode === 'SUBSEQUENTE' ? 1 : null,
          periodLabel: mode === 'INTEGRADO' ? '2026' : '2026.2',
          schoolYear: 2026,
          validFrom: new Date(
            mode === 'INTEGRADO' ? '2026-02-01' : '2026-08-01',
          ),
          validUntil: new Date('2026-12-31'),
          ...(course
            ? { offeringId: course.id, calendarModule: 1, calendarRevision: 1 }
            : {}),
        },
      });
      const sibling = await person('student'),
        noPeriod = await person('student');
      await db.enrollment.create({
        data: { ...enrollment, id: randomUUID(), studentId: sibling.s.id },
      });
      await db.enrollment.create({
        data: {
          ...enrollment,
          id: randomUUID(),
          studentId: noPeriod.s.id,
          periodLabel: null,
          validFrom: null,
          validUntil: null,
        },
      });
      await page
        .context()
        .addCookies([
          { name: 'ete_portal_session', value: staff.token, url: base },
        ]);
      await studentContext.addCookies([
        { name: 'ete_portal_session', value: student.token, url: base },
      ]);
      // Cold compilation in Next dev reloads connected tabs. Compile all routes
      // before starting the two-session interaction; no retries or longer limits.
      const warmStudent = await studentContext.newPage();
      expect((await warmStudent.goto(base + '/declaracao'))?.status()).toBe(
        200,
      );
      await warmStudent.close();
      expect(
        (
          await studentContext.request.get(base + '/api/localidades?uf=PE')
        ).status(),
      ).toBe(200);
      expect(
        (
          await studentContext.request.get(
            base + '/api/declaracao/solicitacoes',
          )
        ).status(),
      ).toBe(200);
      for (const route of ['administracao', 'situacao-escolar']) {
        expect(
          (
            await page.request.get(base + '/api/secretaria/alunos/' + route)
          ).status(),
        ).toBe(405);
      }
      phase = 'buscar aluno';
      // Exercise a catalogue that needed more than one maintenance batch.
      // The transport cursor must be discarded when changing school modes.
      const batchCursor = randomUUID();
      let initialBatch = mode === 'INTEGRADO';
      let checkedModeReset = false;
      if (mode === 'INTEGRADO')
        await page.route(
          '**/api/secretaria/alunos/administracao',
          async (route) => {
            const body = route.request().postDataJSON();
            if (body.operation !== 'classes') return route.continue();
            if (body.mode === 'SUBSEQUENTE') {
              expect(body.afterStudentId).toBeNull();
              checkedModeReset = true;
            }
            if (initialBatch) {
              initialBatch = false;
              return route.fulfill({
                json: {
                  classes: [],
                  page: 1,
                  hasNext: false,
                  updating: true,
                  nextCursor: batchCursor,
                },
              });
            }
            if (body.afterStudentId === batchCursor) {
              const response = await route.fetch({
                postData: { ...body, afterStudentId: null },
              });
              return route.fulfill({ response });
            }
            return route.continue();
          },
        );
      await page.goto(base + '/secretaria/alunos');
      if (mode === 'INTEGRADO') {
        await expect(
          page.getByRole('button', {
            name: `Ver alunos da turma ${className} · 2026`,
            exact: true,
          }),
        ).toBeVisible();
        await page
          .getByRole('button', { name: 'Subsequente', exact: true })
          .click();
        await expect.poll(() => checkedModeReset).toBe(true);
        await page
          .getByRole('button', { name: 'Integrado', exact: true })
          .click();
        await page.unroute('**/api/secretaria/alunos/administracao');
      }
      if (mode === 'SUBSEQUENTE')
        await page
          .getByRole('button', { name: 'Subsequente', exact: true })
          .click();
      await page
        .getByRole('button', {
          name: `Ver alunos da turma ${className} · ${mode === 'INTEGRADO' ? '2026' : '2026.2'}`,
          exact: true,
        })
        .click();
      await expect(
        page.getByRole('region', { name: 'Resultado da busca de alunos' }),
      ).toContainText(student.s.fullName!);
      await page
        .getByRole('listitem')
        .filter({ hasText: student.s.schoolRegistration! })
        .getByRole('button', { name: 'Ver aluno e bloqueios' })
        .click();
      await expect(
        page.getByRole('dialog', { name: 'Dados e bloqueios do aluno' }),
      ).toBeVisible();
      phase = 'abrir situação';
      await page
        .getByRole('button', {
          name: `Conferir situação escolar de ${className}`,
          exact: true,
        })
        .click();
      const panel = page.getByRole('region', { name: 'Situação escolar' });
      await expect(
        panel.getByText('Matrícula a conferir', { exact: true }),
      ).toBeVisible();
      let lose = mode === 'INTEGRADO';
      await page.route(
        '**/api/secretaria/alunos/situacao-escolar',
        async (route) => {
          const body = route.request().postDataJSON();
          if (body.operation !== 'change') return route.continue();
          keys.push(body.requestKey);
          if (lose) {
            lose = false;
            const response = await route.fetch();
            expect(response.status()).toBe(200);
            return route.abort('failed');
          }
          return route.continue();
        },
      );
      phase = 'confirmar matrícula';
      await panel
        .getByRole('button', {
          name: 'Confirmar matrícula e passagem automática',
          exact: true,
        })
        .click();
      const dialog = page.getByRole('dialog', {
        name: 'Confirmar matrícula e passagem automática',
        exact: true,
      });
      await expect(
        dialog.getByRole('button', { name: 'Voltar sem alterar' }),
      ).toBeFocused();
      await dialog
        .getByLabel('Motivo da alteração')
        .fill('Dados fictícios escolares conferidos.');
      await dialog.getByRole('checkbox').check();
      await dialog
        .getByRole('button', {
          name: 'Confirmar alteração escolar',
          exact: true,
        })
        .click();
      if (mode === 'INTEGRADO') {
        await expect(dialog.getByRole('alert')).toContainText(
          'A resposta não chegou',
        );
        await expect(dialog.getByLabel('Motivo da alteração')).toBeDisabled();
        await dialog
          .getByRole('button', { name: 'Repetir o mesmo envio', exact: true })
          .click();
        expect(keys).toHaveLength(2);
        expect(keys[0]).toBe(keys[1]);
      }
      await expect(dialog).not.toBeVisible();
      await expect(
        panel.getByText('Matrícula ativa', { exact: true }),
      ).toBeVisible();
      expect(
        (
          await db.enrollment.findUniqueOrThrow({
            where: { id: enrollment.id },
          })
        ).status,
      ).toBe('ACTIVE');
      phase = 'aluno emite';
      // A compilação fria de uma rota no servidor de desenvolvimento pode
      // recarregar clientes conectados. Compile antes de preencher o formulário.
      await studentContext.addCookies([
        { name: 'ete_portal_session', value: student.token, url: base },
      ]);
      studentPage = await studentContext.newPage();
      studentPage.on('pageerror', (e) => errors.push(e.message));
      studentPage.on('response', async (response) => {
        if (
          response.url().includes('/api/declaracao/solicitacoes') &&
          response.request().method() === 'POST'
        ) {
          const body = await response.json().catch(() => ({}));
          responses.push({
            status: response.status(),
            ...(typeof body.error === 'string' ? { error: body.error } : {}),
          });
        }
      });
      await studentPage.goto(base + '/declaracao');
      await studentPage
        .getByRole('button', { name: 'Gerar declaração', exact: true })
        .click();
      const birthplace = studentPage.getByRole('dialog', {
        name: 'Onde você nasceu?',
      });
      await birthplace
        .getByLabel('Estado de nascimento (UF)')
        .selectOption('PE');
      await expect(
        birthplace
          .getByLabel('Município de nascimento')
          .getByRole('option', { name: 'Recife', exact: true }),
      ).toHaveCount(1);
      await birthplace
        .getByLabel('Município de nascimento')
        .selectOption('2611606');
      await birthplace.getByRole('checkbox').check();
      const issuanceResponse = studentPage.waitForResponse(
        (response) =>
          response.url().endsWith('/api/declaracao/solicitacoes') &&
          response.request().method() === 'POST',
        { timeout: 15000 },
      );
      await birthplace
        .getByRole('button', { name: 'Gerar declaração', exact: true })
        .click();
      expect((await issuanceResponse).status()).toBe(201);
      await expect(
        studentPage.getByText('Disponível para baixar', { exact: true }),
      ).toBeVisible();
      const original = await db.declarationDocument.findFirstOrThrow({
        where: { studentId: student.s.id },
        include: { archive: true },
      });
      expect(original.archive).not.toBeNull();
      phase = 'marcar repetência';
      await panel
        .getByRole('button', {
          name: 'Marcar reprovação desta etapa',
          exact: true,
        })
        .click();
      const repeatDialog = page.getByRole('dialog', {
        name: 'Marcar reprovação desta etapa',
        exact: true,
      });
      await repeatDialog
        .getByLabel('Motivo da alteração')
        .fill('Reprovação fictícia confirmada.');
      await repeatDialog.getByRole('checkbox').check();
      await repeatDialog
        .getByRole('button', {
          name: 'Confirmar alteração escolar',
          exact: true,
        })
        .click();
      await expect(repeatDialog).not.toBeVisible();
      await expect(
        panel.getByText('Reprovado: aguardando nova turma', {
          exact: true,
        }),
      ).toBeVisible();
      const selectedRow = page
        .locator('section[aria-label="Resultado da busca de alunos"] li')
        .filter({ hasText: student.s.schoolRegistration! });
      const siblingRow = page
        .locator('section[aria-label="Resultado da busca de alunos"] li')
        .filter({ hasText: sibling.s.schoolRegistration! });
      await expect(selectedRow).toContainText('Novas declarações bloqueadas');
      await expect(siblingRow).toContainText('Novas declarações sem bloqueio');
      for (const status of ['UNBLOCKED', 'ISSUANCE_BLOCKED']) {
        const filtered = await page.request.post(
          base + '/api/secretaria/alunos/administracao',
          {
            headers: { Origin: base },
            data: {
              operation: 'search',
              mode,
              className,
              periodLabel: mode === 'INTEGRADO' ? '2026' : '2026.2',
              status,
            },
          },
        );
        expect(filtered.status()).toBe(200);
        const found = (await filtered.json()).students.map(
          (s: { id: string }) => s.id,
        );
        expect(found.includes(student.s.id)).toBe(
          status === 'ISSUANCE_BLOCKED',
        );
        expect(found.includes(sibling.s.id)).toBe(status === 'UNBLOCKED');
        expect(found).not.toContain(noPeriod.s.id);
      }
      const missingPeriod = await page.request.post(
        base + '/api/secretaria/alunos/administracao',
        {
          headers: { Origin: base },
          data: { operation: 'search', periodLabel: null },
        },
      );
      expect(missingPeriod.status()).toBe(200);
      const missingIds = (await missingPeriod.json()).students.map(
        (s: { id: string }) => s.id,
      );
      expect(missingIds).toContain(noPeriod.s.id);
      expect(missingIds).not.toContain(student.s.id);
      expect(missingIds).not.toContain(sibling.s.id);
      phase = 'bloqueio do aluno';
      await studentPage.reload();
      await expect(
        studentPage.getByRole('button', {
          name: 'Gerar declaração',
          exact: true,
        }),
      ).toBeDisabled();
      const forged = await studentPage.request.post(
        base + '/api/secretaria/alunos/situacao-escolar',
        {
          headers: { Origin: base },
          data: {
            operation: 'detail',
            enrollmentId: enrollment.id,
            role: 'secretary',
          },
        },
      );
      expect(forged.status()).toBe(403);
      const catalogueDenied = await studentPage.request.post(
        base + '/api/secretaria/alunos/administracao',
        {
          headers: { Origin: base },
          data: { operation: 'classes', mode, role: 'secretary' },
        },
      );
      expect(catalogueDenied.status()).toBe(403);
      const catalogue = await page.request.post(
        base + '/api/secretaria/alunos/administracao',
        { headers: { Origin: base }, data: { operation: 'classes', mode } },
      );
      expect(catalogue.status()).toBe(200);
      const catalogueBody = await catalogue.json();
      expect(
        catalogueBody.classes.every(
          (row: { mode: string }) => row.mode === mode,
        ),
      ).toBe(true);
      expect(catalogueBody.classes.length).toBeLessThanOrEqual(20);
      expect(JSON.stringify(catalogueBody)).not.toContain(student.s.fullName!);
      const denied = await studentPage.request.post(
        base + '/api/declaracao/solicitacoes',
        {
          headers: { Origin: base },
          data: { enrollmentId: enrollment.id, requestKey: randomUUID() },
        },
      );
      expect(denied.status()).toBe(403);
      expect(
        await db.declarationDocument.count({
          where: { studentId: student.s.id },
        }),
      ).toBe(1);
      const downloadEvent = studentPage.waitForEvent('download');
      await studentPage
        .getByRole('button', { name: 'Baixar', exact: true })
        .click();
      const download = await downloadEvent;
      expect(await download.failure()).toBeNull();
      phase = 'concorrência';
      const detail = await page.request.post(
        base + '/api/secretaria/alunos/situacao-escolar',
        {
          headers: { Origin: base },
          data: { operation: 'detail', enrollmentId: enrollment.id },
        },
      );
      const state = await detail.json();
      const requests = await Promise.all(
        [1, 2].map(() =>
          page.request.post(base + '/api/secretaria/alunos/situacao-escolar', {
            headers: { Origin: base },
            data: {
              operation: 'change',
              enrollmentId: enrollment.id,
              action: 'RESUME',
              version: state.enrollment.version,
              requestKey: randomUUID(),
              reason: 'Correção fictícia após conferência.',
              confirmed: true,
            },
          }),
        ),
      );
      expect(requests.map((r) => r.status()).sort()).toEqual([200, 409]);
      expect(
        await db.schoolAcademicEvent.count({
          where: { enrollmentId: enrollment.id, kind: 'RESUME' },
        }),
      ).toBe(1);
      await panel
        .getByRole('button', {
          name: 'Consultar situação escolar novamente',
          exact: true,
        })
        .click();
      await expect(
        panel.getByText('Matrícula ativa', { exact: true }),
      ).toBeVisible();
      await expect(selectedRow).toContainText('Novas declarações sem bloqueio');
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`situacao-${mode}-${width}.png`),
          fullPage: true,
        });
      }
      await page
        .getByRole('button', { name: 'Voltar à lista de alunos', exact: true })
        .click();
      await expect(
        page.getByRole('dialog', { name: 'Dados e bloqueios do aluno' }),
      ).not.toBeVisible();
      await expect(
        page
          .getByRole('listitem')
          .filter({ hasText: student.s.schoolRegistration! })
          .getByRole('button', { name: 'Ver aluno e bloqueios' }),
      ).toBeFocused();
      await page.setViewportSize({ width: 320, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`turmas-${mode}-320.png`),
        fullPage: true,
      });
      expect(errors).toEqual([]);
    } catch (error) {
      if (studentPage)
        await studentPage
          .screenshot({
            path: info.outputPath('falha-aluno.png'),
            fullPage: true,
          })
          .catch(() => {});
      await page
        .screenshot({
          path: info.outputPath('falha-situacao.png'),
          fullPage: true,
        })
        .catch(() => {});
      await writeFile(
        info.outputPath('fase.json'),
        JSON.stringify({
          phase,
          responses,
          browserErrors: errors,
          error:
            error instanceof Error
              ? error.message.split('\n')[0].slice(0, 500)
              : 'Erro sintético',
        }),
      );
      throw error;
    } finally {
      await studentContext.close();
      await env.close();
    }
  });
}
