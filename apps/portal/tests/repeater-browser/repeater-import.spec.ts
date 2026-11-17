import { test, expect } from '@playwright/test';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import { openTestEnvironment } from '../../scripts/test-environment';
import { schoolHeaderFixture } from '../../scripts/test-sheet-input';
import { schoolClassSchedule } from '../../src/lib/school-class-input';
for (const mode of ['INTEGRADO', 'SUBSEQUENTE'] as const)
  test(`enturmação ${mode}: escolha explícita, resposta perdida e PDF anterior preservado`, async ({
    page,
    browser,
  }, info) => {
    const old = process.env.DECLARATION_REGISTRY_PREVIEW;
    process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
    const env = await openTestEnvironment({ http: true });
    const { db, base } = env;
    const studentContext = await browser.newContext();
    const errors: string[] = [];
    let phase = 'fixtures';
    page.on('pageerror', (e) => errors.push(e.name));
    try {
      async function person(role: 'secretary' | 'student') {
        const s = await db.student.create({
          data: {
            fullName: `Pessoa fictícia repetente ${role} ${mode}`,
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
            email: randomUUID() + '@example.invalid',
            role,
            status: 'active',
            passwordHash: 'fictício',
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
        pupil = await person('student');
      await page
        .context()
        .addCookies([
          { name: 'ete_portal_session', value: staff.token, url: base },
        ]);
      await studentContext.addCookies([
        { name: 'ete_portal_session', value: pupil.token, url: base },
      ]);
      const course =
        mode === 'SUBSEQUENTE'
          ? await db.courseOffering.create({
              data: {
                label: 'Origem fictícia',
                courseLabel: 'DS',
                calendars: {
                  create: {
                    revision: 1,
                    schedule: schoolClassSchedule(
                      'DS',
                      1,
                      '2026.2',
                      'STDSIN1U',
                    ),
                    createdById: staff.a.id,
                  },
                },
              },
            })
          : null;
      const row = await db.enrollment.create({
        data: {
          studentId: pupil.s.id,
          mode,
          courseLabel: 'DS',
          grade: mode === 'INTEGRADO' ? 1 : null,
          moduleNumber: mode === 'SUBSEQUENTE' ? 1 : null,
          className: mode === 'INTEGRADO' ? '1A DS' : 'STDSIN1U',
          schoolYear: 2026,
          periodLabel: mode === 'INTEGRADO' ? '2026' : '2026.2',
          status: 'ACTIVE',
          reviewedAt: new Date(),
          reviewedById: staff.a.id,
          progressionHeld: false,
          validFrom: new Date(
            mode === 'INTEGRADO' ? '2026-02-01' : '2026-08-01',
          ),
          validUntil: new Date('2026-12-31'),
          ...(course
            ? { offeringId: course.id, calendarModule: 1, calendarRevision: 1 }
            : {}),
        },
      });
      phase = 'documento anterior';
      const issued = await studentContext.request.post(
        base + '/api/declaracao/solicitacoes',
        {
          headers: { Origin: base },
          data: { enrollmentId: row.id, requestKey: randomUUID() },
        },
      );
      expect(issued.status()).toBe(201);
      const doc = (await issued.json()).request.document.id;
      const previous = await studentContext.request.post(
        base + '/api/declaracao/arquivo',
        { headers: { Origin: base }, data: { documentId: doc } },
      );
      expect(previous.status()).toBe(200);
      const pdf = await previous.body();
      const detail = await page.request.post(
        base + '/api/secretaria/alunos/situacao-escolar',
        {
          headers: { Origin: base },
          data: { operation: 'detail', enrollmentId: row.id },
        },
      );
      expect(detail.status()).toBe(200);
      const repeat = await page.request.post(
        base + '/api/secretaria/alunos/situacao-escolar',
        {
          headers: { Origin: base },
          data: {
            operation: 'change',
            enrollmentId: row.id,
            action: 'REPEAT',
            version: (await detail.json()).enrollment.version,
            requestKey: randomUUID(),
            reason: 'Reprovação fictícia confirmada.',
            confirmed: true,
          },
        },
      );
      expect(repeat.status()).toBe(200);
      phase = 'exceção de atendimento pela tela';
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
      const school = page.getByRole('region', {
        name: 'Situação escolar',
        exact: true,
      });
      for (const [label, message] of [
        [
          'Liberar solicitações enquanto aguarda turma',
          'Solicitações liberadas por exceção',
        ],
        [
          'Voltar a aguardar turma sem novas solicitações',
          'Espera por turma restabelecida',
        ],
      ]) {
        await school.getByRole('button', { name: label, exact: true }).click();
        const confirmation = page.getByRole('dialog', {
          name: label,
          exact: true,
        });
        await confirmation
          .getByLabel('Motivo da alteração')
          .fill('Conferência fictícia de atendimento.');
        await confirmation.getByRole('checkbox').check();
        const changed = page.waitForResponse(
          (r) =>
            new URL(r.url()).pathname ===
              '/api/secretaria/alunos/situacao-escolar' &&
            r.request().postDataJSON()?.operation === 'change',
        );
        await confirmation
          .getByRole('button', {
            name: 'Confirmar alteração escolar',
            exact: true,
          })
          .click();
        expect((await changed).status()).toBe(200);
        await expect(school.getByText(message, { exact: true })).toBeVisible();
      }
      await page
        .getByRole('button', { name: 'Voltar à lista de alunos', exact: true })
        .click();
      phase = 'arquivo e turmas';
      const a = schoolHeaderFixture(
        mode,
        'DS',
        1,
        mode === 'INTEGRADO' ? '2027' : '2027.1',
        mode === 'INTEGRADO' ? 'TDS1IN-A' : 'STDSIN1A',
      );
      const b = schoolHeaderFixture(
        mode,
        'DS',
        1,
        mode === 'INTEGRADO' ? '2027' : '2027.1',
        mode === 'INTEGRADO' ? 'TDS1IN-B' : 'STDSIN1B',
      );
      a.wb.Sheets['Fictícia'].A7 = {
        t: 's',
        v: mode === 'INTEGRADO' ? '7100101' : '7200101',
      };
      b.wb.Sheets['Fictícia'].A7 = {
        t: 's',
        v: mode === 'INTEGRADO' ? '7100102' : '7200102',
      };
      XLSX.utils.book_append_sheet(a.wb, b.wb.Sheets['Fictícia'], 'Turma B');
      const label = mode === 'INTEGRADO' ? 'integrado' : 'subsequente';
      await page.goto(base + '/secretaria/importacao/' + label);
      await page
        .getByLabel(`Planilha de alunos do ${label}`, { exact: true })
        .setInputFiles({
          name: 'turmas-ficticias.xls',
          mimeType: 'application/vnd.ms-excel',
          buffer: a.file(),
        });
      const waitFor = (action: string) =>
        page.waitForResponse(
          (r) =>
            new URL(r.url()).pathname === '/api/secretaria/importacao' &&
            r.request().postDataJSON()?.action === action,
        );
      let response = waitFor('inspect');
      await page
        .getByRole('button', { name: 'Ler arquivo', exact: true })
        .click();
      expect((await response).status()).toBe(200);
      for (const check of await page
        .getByRole('checkbox', { name: /Conferi turma/ })
        .all())
        await check.check();
      await page
        .getByLabel('Turma de destino dos repetentes', { exact: true })
        .selectOption('Turma B');
      response = waitFor('repeaters');
      await page
        .getByRole('button', {
          name: 'Consultar repetentes compatíveis',
          exact: true,
        })
        .click();
      expect((await response).status()).toBe(200);
      await page
        .getByRole('checkbox', { name: new RegExp(pupil.s.fullName!) })
        .check();
      await expect(
        page.getByRole('region', { name: 'Repetentes selecionados' }),
      ).toContainText(mode === 'INTEGRADO' ? 'TDS1IN-B' : 'STDSIN1B');
      phase = 'dados atualizados por outro atendimento';
      const current = await page.request.post(
        base + '/api/secretaria/alunos/situacao-escolar',
        {
          headers: { Origin: base },
          data: { operation: 'detail', enrollmentId: row.id },
        },
      );
      expect(current.status()).toBe(200);
      const allowed = await page.request.post(
        base + '/api/secretaria/alunos/situacao-escolar',
        {
          headers: { Origin: base },
          data: {
            operation: 'change',
            enrollmentId: row.id,
            action: 'ALLOW_REQUESTS',
            version: (await current.json()).enrollment.version,
            requestKey: randomUUID(),
            reason: 'Atendimento fictício concorrente.',
            confirmed: true,
          },
        },
      );
      expect(allowed.status()).toBe(200);
      response = waitFor('preview');
      await page
        .getByRole('button', { name: 'Gerar prévia', exact: true })
        .click();
      expect((await response).status()).toBe(409);
      await expect(
        page
          .getByRole('alert')
          .filter({
            hasText: 'A situação de um repetente ou a turma escolhida mudou.',
          }),
      ).toBeVisible();
      response = waitFor('repeaters');
      await page
        .getByRole('button', {
          name: 'Consultar repetentes compatíveis',
          exact: true,
        })
        .click();
      const refreshed = await response;
      expect(refreshed.status()).toBe(200);
      await expect(
        page.getByRole('region', { name: 'Repetentes selecionados' }),
      ).toHaveCount(0);
      const query = refreshed.request().postDataJSON();
      expect(
        (
          await studentContext.request.post(
            base + '/api/secretaria/importacao',
            { headers: { Origin: base }, data: query },
          )
        ).status(),
      ).toBe(403);
      expect(
        (
          await page.request.post(base + '/api/secretaria/importacao', {
            headers: { Origin: 'https://example.invalid' },
            data: query,
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await page.request.post(base + '/api/secretaria/importacao', {
            headers: { Origin: base },
            data: { ...query, role: 'secretary' },
          })
        ).status(),
      ).toBe(400);
      await page
        .getByRole('checkbox', { name: new RegExp(pupil.s.fullName!) })
        .check();
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`selecao-${mode}-${width}.png`),
          fullPage: true,
        });
      }
      phase = 'prévia';
      response = waitFor('preview');
      await page
        .getByRole('button', { name: 'Gerar prévia', exact: true })
        .click();
      const preview = await response;
      expect(preview.status()).toBe(200);
      const payload = preview.request().postDataJSON();
      expect(Object.keys(payload.repeaters[0]).sort()).toEqual([
        'enrollmentId',
        'sheetName',
        'version',
      ]);
      const section = page.getByRole('region', {
        name: 'Prévia da enturmação dos repetentes',
      });
      await expect(section).toContainText('Selecionado fora da planilha.');
      await expect(section).toContainText('Nova turma a partir de 01/02/2027');
      await expect(section).toContainText(
        mode === 'INTEGRADO' ? 'TDS1IN-B' : 'STDSIN1B',
      );
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`enturmacao-${mode}-${width}.png`),
          fullPage: true,
        });
      }
      phase = 'confirmar';
      let lose = mode === 'INTEGRADO';
      await page.route('**/api/secretaria/importacao', async (route) => {
        if (route.request().postDataJSON()?.action === 'confirm' && lose) {
          lose = false;
          const res = await route.fetch();
          expect(res.status()).toBe(200);
          return route.abort('failed');
        }
        return route.continue();
      });
      await page
        .getByRole('button', { name: 'Aplicar importação', exact: true })
        .click();
      const modal = page.getByRole('dialog');
      await modal
        .getByRole('checkbox', { name: /Conferi os 1 repetente/ })
        .check();
      await modal
        .getByRole('button', { name: 'Confirmar importação', exact: true })
        .click();
      if (mode === 'INTEGRADO') {
        await expect(modal.getByRole('alert')).toContainText(
          'Resultado não confirmado',
        );
        await modal
          .getByRole('button', { name: 'Confirmar importação', exact: true })
          .click();
      }
      await expect(
        page.getByRole('heading', {
          name: 'Importação concluída',
          exact: true,
        }),
      ).toBeVisible();
      const saved = await db.enrollment.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(saved.repetitionPending).toBe(false);
      expect(saved.grade ?? saved.moduleNumber).toBe(1);
      expect(saved.className).toBe(
        mode === 'INTEGRADO' ? 'TDS1IN-B' : 'STDSIN1B',
      );
      expect(saved.validFrom?.toISOString().slice(0, 10)).toBe('2027-02-01');
      expect(
        await db.schoolAcademicEvent.count({
          where: { enrollmentId: row.id, kind: 'TRANSFER' },
        }),
      ).toBe(1);
      expect(
        await db.enrollment.count({ where: { studentId: pupil.s.id } }),
      ).toBe(1);
      const denied = await studentContext.request.post(
        base + '/api/declaracao/solicitacoes',
        {
          headers: { Origin: base },
          data: { enrollmentId: row.id, requestKey: randomUUID() },
        },
      );
      expect(denied.status()).toBe(422);
      const after = await studentContext.request.post(
        base + '/api/declaracao/arquivo',
        { headers: { Origin: base }, data: { documentId: doc } },
      );
      expect(after.status()).toBe(200);
      expect(await after.body()).toEqual(pdf);
      expect(errors).toEqual([]);
    } catch (error) {
      await writeFile(info.outputPath('fase.txt'), phase);
      throw error;
    } finally {
      await studentContext.close();
      await env.close();
      if (old === undefined) delete process.env.DECLARATION_REGISTRY_PREVIEW;
      else process.env.DECLARATION_REGISTRY_PREVIEW = old;
    }
  });
