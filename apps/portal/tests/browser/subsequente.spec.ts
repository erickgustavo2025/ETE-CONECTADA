import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/lib/password';
import { sheetFixture } from '../../scripts/test-sheet-input';
import { saveCourseCalendar } from '../../src/lib/course-calendars';
import type { CalendarDraft } from '../../src/lib/course-calendar-input';
test('secretaria importa subsequente com calendário, módulos e exceções sem alterar integrado', async ({
  page,
  context,
}, testInfo) => {
  const { openTestEnvironment } =
    await import('../../scripts/test-environment');
  const env = await openTestEnvironment({ http: true }),
    { db, base } = env;
  const students: string[] = [],
    offers: string[] = [];
  const errors: string[] = [],
    modes: string[] = [];
  page.on('pageerror', (e) => errors.push(e.name));
  page.on('request', (r) => {
    if (
      r.url() === base + '/api/secretaria/importacao' &&
      r.method() === 'POST'
    )
      modes.push(r.postDataJSON().mode);
  });
  try {
    const email = `sub-ui-${randomUUID()}@eteconectada.invalid`,
      password = 'SubsequenteUI#123';
    const actor = await db.student.create({
      data: {
        fullName: 'Secretaria fictícia subsequente',
        birthDate: new Date('2000-01-15'),
        account: {
          create: {
            email,
            passwordHash: await hashPassword(password),
            status: 'active',
            role: 'secretary',
          },
        },
      },
      include: { account: true },
    });
    students.push(actor.id);
    expect(
      (
        await context.request.post(base + '/api/login', {
          data: { identifier: email, password },
        })
      ).status(),
    ).toBe(200);
    await page.goto(base + '/');
    await page
      .getByRole('button', { name: 'Abrir menu de serviços', exact: true })
      .click();
    await page
      .getByRole('link', {
        name: 'Importar alunos do subsequente',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Importar alunos do subsequente',
        exact: true,
      }),
    ).toBeVisible();
    const upload = async (buffer: Buffer) => {
      await page
        .getByLabel('Planilha de alunos do subsequente', { exact: true })
        .setInputFiles({
          name: 'subsequente-ficticio.xls',
          mimeType: 'application/vnd.ms-excel',
          buffer,
        });
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/secretaria/importacao') &&
          r.request().postDataJSON().action === 'inspect',
      );
      await page
        .getByRole('button', { name: 'Ler arquivo', exact: true })
        .click();
      return response;
    };
    expect((await upload(sheetFixture().file())).status()).toBe(422);
    await expect(page.locator('#conteudo').getByRole('alert')).toContainText(
      'Modalidade',
    );
    const empty = sheetFixture('SUBSEQUENTE');
    expect((await upload(empty.file())).status()).toBe(200);
    await expect(
      page.getByRole('link', { name: 'cadastre o calendário', exact: true }),
    ).toBeVisible();
    expect(
      await page.getByLabel('Oferta desta aba').locator('option').count(),
    ).toBe(1);
    await page
      .getByRole('button', { name: 'Gerar prévia', exact: true })
      .click();
    await expect(page.getByLabel('Oferta desta aba')).toBeFocused();
    await page
      .getByRole('button', { name: 'Trocar arquivo', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Descartar conferência', exact: true })
      .click();
    const pupil = await db.student.create({
      data: {
        schoolRegistration: '00001001',
        fullName: 'Pessoa Fictícia Um',
        birthDate: new Date('2008-02-29'),
        details: {
          create: {
            parentOne: 'Filiação Fictícia Um',
            parentTwo: 'Filiação Fictícia Dois',
            parentageSource: 'SCHOOL_RECORD',
          },
        },
        account: {
          create: {
            email: `pupil-${randomUUID()}@eteconectada.invalid`,
            passwordHash: await hashPassword(password),
            status: 'active',
            role: 'student',
          },
        },
        enrollments: {
          create: [
            {
              mode: 'INTEGRADO',
              className: 'Integrado preservado',
              courseLabel: 'ADM',
              grade: 1,
            },
            {
              mode: 'SUBSEQUENTE',
              className: 'DS legado',
              courseLabel: 'DS',
              moduleNumber: 1,
            },
          ],
        },
      },
      include: { enrollments: true, account: true },
    });
    students.push(pupil.id);
    const integrated = pupil.enrollments.find((e) => e.mode === 'INTEGRADO')!,
      legacy = pupil.enrollments.find((e) => e.mode === 'SUBSEQUENTE')!;
    const integratedBefore = await db.enrollment.findUniqueOrThrow({
        where: { id: integrated.id },
      }),
      accountBefore = pupil.account!;
    const year = new Date().getUTCFullYear();
    const courses = new Map<string, { id: string; draft: CalendarDraft }>();
    for (const courseLabel of ['DS', 'ADM', 'ENF'] as const) {
      const count = courseLabel === 'ENF' ? 4 : 3,
        id = randomUUID();
      offers.push(id);
      const draft: CalendarDraft = {
        label: `Oferta fictícia UI ${courseLabel}`,
        courseLabel,
        startsOn: `${year}-01-01`,
        endsOn: `${year + count - 1}-12-31`,
        modules: Array.from({ length: count }, (_, i) => ({
          number: i + 1,
          startsOn: `${year + i}-01-01`,
          endsOn: `${year + i}-12-31`,
          periodLabel: `Período fictício ${i + 1}`,
        })),
      };
      await saveCourseCalendar(db, actor.account!.id, id, 0, draft, true);
      courses.set(courseLabel, { id, draft });
    }
    const second = randomUUID();
    offers.push(second);
    await saveCourseCalendar(
      db,
      actor.account!.id,
      second,
      0,
      { ...courses.get('DS')!.draft, label: 'Outra entrada DS fictícia' },
      true,
    );
    const configure = async (id: string, className: string) => {
      await page.getByLabel('Oferta desta aba').selectOption(id);
      await page.getByLabel('Nome da turma').fill(className);
      await page.getByRole('checkbox', { name: /Conferi oferta/ }).check();
      await page
        .getByRole('button', { name: 'Gerar prévia', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Confira a prévia', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('table', {
          name: 'Prévia de atualização — subsequente',
          exact: true,
        }),
      ).toBeVisible();
    };
    const openConfirmation = async (differs: boolean) => {
      await page
        .getByRole('button', { name: 'Aplicar importação', exact: true })
        .click();
      const dialog = page.getByRole('dialog', {
        name: 'Aplicar esta importação?',
        exact: true,
      });
      await expect(
        dialog.getByRole('button', {
          name: 'Continuar conferindo',
          exact: true,
        }),
      ).toBeFocused();
      if (differs) {
        await expect(
          dialog.getByRole('button', {
            name: 'Confirmar importação',
            exact: true,
          }),
        ).toBeDisabled();
        await dialog
          .getByRole('checkbox', { name: /Conferi as divergências/ })
          .check();
      }
      return dialog;
    };
    let lost = false;
    for (const courseLabel of ['DS', 'ADM', 'ENF'] as const) {
      const course = courses.get(courseLabel)!,
        stage = courseLabel === 'DS' ? 1 : courseLabel === 'ADM' ? 3 : 4;
      const sheet = sheetFixture('SUBSEQUENTE');
      sheet.wb.Sheets['Fictícia'].A3 = {
        t: 's',
        v: `Técnico em ${courseLabel} - Subsequente`,
      };
      sheet.wb.Sheets['Fictícia'].A4 = {
        t: 's',
        v: `${stage}MODULO - TURMA-FICTICIA`,
      };
      expect((await upload(sheet.file())).status()).toBe(200);
      await expect(page.getByLabel('Oferta desta aba')).toHaveValue('');
      if (courseLabel === 'DS')
        expect(
          await page.getByLabel('Oferta desta aba').locator('option').count(),
        ).toBe(3);
      await configure(course.id, `Turma fictícia ${courseLabel}`);
      if (courseLabel === 'DS') {
        const binding = page.getByLabel('Vínculo para matrícula 00001001');
        await expect(
          binding.getByRole('option', { name: /1º módulo/ }),
        ).toHaveCount(1);
        await binding.selectOption(legacy.id);
        await page
          .getByRole('button', {
            name: 'Revisar associações escolhidas',
            exact: true,
          })
          .click();
        await page.getByRole('checkbox', { name: /Conferi oferta/ }).check();
        await page
          .getByRole('button', { name: 'Gerar prévia', exact: true })
          .click();
        await expect(
          page.getByRole('heading', { name: 'Confira a prévia', exact: true }),
        ).toBeVisible();
      }
      await expect(
        page.getByRole('region', {
          name: 'Comparação com o calendário',
          exact: true,
        }),
      ).toContainText(stage === 1 ? 'Compatível' : 'Divergência');
      const dialog = await openConfirmation(stage !== 1);
      if (courseLabel === 'ADM') {
        await saveCourseCalendar(
          db,
          actor.account!.id,
          course.id,
          1,
          { ...course.draft, label: course.draft.label + ' revista' },
          true,
        );
        await dialog
          .getByRole('button', { name: 'Confirmar importação', exact: true })
          .click();
        await expect(
          page.getByRole('heading', { name: 'Confira cada aba', exact: true }),
        ).toBeVisible();
        await page
          .getByRole('button', { name: 'Gerar prévia', exact: true })
          .click();
        await expect(
          page.getByRole('heading', { name: 'Confira a prévia', exact: true }),
        ).toBeVisible();
        await openConfirmation(true);
      }
      if (courseLabel === 'ENF')
        await page.route('**/api/secretaria/importacao', async (route) => {
          if (route.request().postDataJSON().action === 'confirm' && !lost) {
            lost = true;
            const response = await route.fetch();
            expect(response.status()).toBe(200);
            await route.abort('failed');
            return;
          }
          await route.continue();
        });
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Confirmar importação', exact: true })
        .click();
      if (courseLabel === 'ENF') {
        await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
          'Resultado não confirmado',
        );
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Confirmar importação', exact: true })
          .click();
      }
      await expect(
        page.getByRole('heading', {
          name: 'Importação concluída',
          exact: true,
        }),
      ).toBeVisible();
      const saved = await db.enrollment.findFirstOrThrow({
        where: { studentId: pupil.id, mode: 'SUBSEQUENTE', courseLabel },
      });
      expect(saved.offeringId).toBe(course.id);
      expect(saved.moduleNumber).toBe(stage);
      expect(saved.progressionHeld).toBe(true);
      expect(saved.grade).toBe(null);
      expect(saved.periodLabel).toBe(
        course.draft.modules[stage - 1].periodLabel,
      );
      expect(
        await db.enrollment.findUniqueOrThrow({ where: { id: integrated.id } }),
      ).toEqual(integratedBefore);
      expect(
        await db.account.findUniqueOrThrow({ where: { id: accountBefore.id } }),
      ).toEqual(accountBefore);
      await page
        .getByRole('button', { name: 'Importar outro arquivo', exact: true })
        .click();
      expect((await upload(sheet.file())).status()).toBe(200);
      await configure(course.id, `Turma fictícia ${courseLabel}`);
      await expect(
        page.getByRole('row').filter({ hasText: 'Pessoa Fictícia Um' }),
      ).toContainText('Sem alteração');
      if (courseLabel === 'ENF') {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.screenshot({
          path: testInfo.outputPath('subsequente-1440.png'),
          fullPage: true,
        });
        await page.setViewportSize({ width: 320, height: 740 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath('subsequente-320.png'),
          fullPage: true,
        });
      }
      await openConfirmation(stage !== 1);
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Confirmar importação', exact: true })
        .click();
      await expect(
        page.getByRole('heading', {
          name: 'Importação concluída',
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await db.enrollment.count({
          where: { studentId: pupil.id, mode: 'SUBSEQUENTE', courseLabel },
        }),
      ).toBe(1);
      await page
        .getByRole('button', { name: 'Importar outro arquivo', exact: true })
        .click();
    }
    expect(lost).toBe(true);
    expect(modes.every((mode) => mode === 'SUBSEQUENTE')).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    try {
      await db.student.deleteMany({ where: { id: { in: students } } });
      await db.courseCalendarVersion.deleteMany({
        where: { offeringId: { in: offers } },
      });
      await db.courseOffering.deleteMany({ where: { id: { in: offers } } });
    } finally {
      await env.close();
    }
  }
});
