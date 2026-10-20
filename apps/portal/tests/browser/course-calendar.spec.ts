import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/lib/password';
test('calendário de turma exige datas conferidas e permite política explícita', async ({
  page,
  context,
}, testInfo) => {
  const { openTestEnvironment } =
    await import('../../scripts/test-environment');
  const env = await openTestEnvironment({ http: true });
  const { db, base } = env;
  let studentId: string | undefined,
    offeringId: string | undefined,
    pupilId: string | undefined;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.name));
  try {
    const email = `calendar-ui-${randomUUID()}@eteconectada.invalid`,
      password = 'SenhaCalendarioUI#123';
    const staff = await db.student.create({
      data: {
        fullName: 'Secretaria fictícia calendário',
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
    });
    studentId = staff.id;
    expect(
      (
        await context.request.post(base + '/api/login', {
          headers: { Origin: base },
          data: { identifier: email, password },
        })
      ).status(),
    ).toBe(200);
    await page.goto(base + '/secretaria/calendarios');
    await expect(
      page.getByRole('heading', {
        name: 'Calendário do subsequente',
        exact: true,
      }),
    ).toBeVisible();

    await page
      .getByRole('button', { name: 'Cadastrar turma', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Salvar calendário', exact: true })
      .click();
    await expect(
      page.getByLabel('Turma e ingresso', { exact: true }),
    ).toBeFocused();
    // A tela orienta a secretaria pelo nome da turma; IDs continuam internos.
    await expect(page.locator('main')).not.toContainText(
      /identificador|nova oferta|versão/i,
    );
    await expect(page.locator('main code')).toHaveCount(0);
    await expect(
      page.locator('nextjs-portal').getByRole('button', { name: /dev tools/i }),
    ).toHaveCount(0);
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({
        path: testInfo.outputPath(`secretaria-cadastro-turma-${width}.png`),
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    const label = 'Turma fictícia UI ' + randomUUID().slice(0, 8);
    await page.getByLabel('Turma e ingresso', { exact: true }).fill(label);
    await page.getByLabel('Curso', { exact: true }).selectOption('ENF');
    await expect(
      page.getByRole('group', { name: 'Módulo 4', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Curso', { exact: true }).selectOption('DS');
    await expect(
      page.getByRole('group', { name: 'Módulo 4', exact: true }),
    ).toHaveCount(0);
    const now = new Date(),
      year = now.getUTCFullYear(),
      month = now.getUTCMonth() < 6 ? 0 : 6;
    const iso = (offset: number, day = 1) =>
      new Date(Date.UTC(year, month + offset, day)).toISOString().slice(0, 10);
    await page.getByLabel('Início do curso', { exact: true }).fill(iso(0));
    await page.getByLabel('Fim do curso', { exact: true }).fill(iso(18, 0));
    for (let i = 0; i < 3; i++) {
      await page
        .getByLabel(`Início do módulo ${i + 1}`, { exact: true })
        .fill(iso(i * 6));
      await page
        .getByLabel(`Fim do módulo ${i + 1}`, { exact: true })
        .fill(iso((i + 1) * 6, 0));
      await page
        .getByLabel(`Período do módulo ${i + 1}`, { exact: true })
        .fill(`Período fictício ${i + 1}`);
    }
    await page.getByRole('checkbox', { name: /Conferi as datas/ }).check();
    await page.getByLabel('Início do módulo 2', { exact: true }).fill(iso(0));
    await page
      .getByRole('button', { name: 'Salvar calendário', exact: true })
      .click();
    await expect(page.locator('#conteudo').getByRole('alert')).toBeVisible();
    await page.getByLabel('Início do módulo 2', { exact: true }).fill(iso(6));
    let lost = false;
    await page.route('**/api/secretaria/calendarios', async (route) => {
      const input = route.request().postDataJSON();
      if (input.action === 'save' && !lost) {
        lost = true;
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        await route.abort('failed');
        return;
      }
      await route.continue();
    });
    await page
      .getByRole('button', { name: 'Salvar calendário', exact: true })
      .click();
    await expect(page.locator('#conteudo').getByRole('alert')).toBeVisible();
    await expect(
      page.getByLabel('Turma e ingresso', { exact: true }),
    ).toHaveValue(label);
    offeringId = (
      await db.courseOffering.findFirstOrThrow({ where: { label } })
    ).id;
    await page
      .getByRole('button', { name: 'Salvar calendário', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: label, exact: true }),
    ).toBeVisible();
    expect(
      await db.courseCalendarVersion.count({ where: { offeringId } }),
    ).toBe(1);
    const pupil = await db.student.create({
      data: {
        fullName: 'Aluno fictício calendário UI',
        birthDate: new Date('2008-01-15'),
        schoolRegistration: '98760001',
        enrollments: {
          create: {
            mode: 'SUBSEQUENTE',
            courseLabel: 'DS',
            moduleNumber: 1,
            className: 'Turma fictícia UI',
          },
        },
      },
      include: { enrollments: true },
    });
    pupilId = pupil.id;
    await page
      .getByRole('button', { name: 'Atualizar alunos', exact: true })
      .click();
    const row = page
      .getByRole('row')
      .filter({ hasText: 'Aluno fictício calendário UI' });
    await expect(row).toBeVisible();
    await row
      .getByRole('button', {
        name: 'Vincular à turma sem mudar módulo',
        exact: true,
      })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Confirmar mudança de módulo',
      exact: true,
    });
    await expect(
      dialog.getByRole('button', { name: 'Cancelar', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(
      row.getByRole('button', {
        name: 'Vincular à turma sem mudar módulo',
        exact: true,
      }),
    ).toBeFocused();
    await row
      .getByRole('button', {
        name: 'Vincular à turma sem mudar módulo',
        exact: true,
      })
      .click();
    await dialog
      .getByRole('button', { name: 'Confirmar alteração', exact: true })
      .click();
    await expect(
      row.getByRole('cell', { name: 'Pausada', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Ativar mudança de módulo nesta página',
        exact: true,
      })
      .click();
    await expect(dialog).toContainText(
      'Matrículas selecionadas nesta página: 1',
    );
    await dialog
      .getByRole('button', { name: 'Confirmar alteração', exact: true })
      .click();
    await expect(
      row.getByRole('cell', { name: 'Automática', exact: true }),
    ).toBeVisible();
    expect(
      (
        await db.enrollment.findUniqueOrThrow({
          where: { id: pupil.enrollments[0].id },
        })
      ).progressionHeld,
    ).toBe(false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: testInfo.outputPath('calendario-1440.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 740 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('calendario-320.png'),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Editar calendário', exact: true })
      .click();
    await page
      .getByLabel('Turma e ingresso', { exact: true })
      .fill(label + ' revista');
    await page.getByRole('checkbox', { name: /Conferi as datas/ }).check();
    await page
      .getByRole('button', { name: 'Salvar calendário', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: label + ' revista', exact: true }),
    ).toBeVisible();
    expect(
      await db.courseCalendarVersion.count({ where: { offeringId } }),
    ).toBe(2);
    expect(errors).toEqual([]);
  } finally {
    try {
      if (pupilId) await db.student.deleteMany({ where: { id: pupilId } });
      if (offeringId) {
        await db.courseCalendarVersion.deleteMany({ where: { offeringId } });
        await db.courseOffering.deleteMany({ where: { id: offeringId } });
      }
      if (studentId) await db.student.deleteMany({ where: { id: studentId } });
    } finally {
      await env.close();
    }
  }
});
