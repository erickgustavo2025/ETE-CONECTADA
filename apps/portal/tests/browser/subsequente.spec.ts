import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/lib/password';
import {
  schoolHeaderFixture,
  sheetFixture,
} from '../../scripts/test-sheet-input';

test('secretaria importa subsequente sem calendário prévio, confere estimativas e repete confirmação incerta', async ({
  page,
  context,
}, testInfo) => {
  const { openTestEnvironment } =
    await import('../../scripts/test-environment');
  const env = await openTestEnvironment({ http: true }),
    { db, base } = env;
  const students: string[] = [],
    scopes: string[] = [],
    errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.name));
  try {
    expect(await db.student.count()).toBe(0);
    const password = 'SubsequenteUI#123',
      email = `sub-ui-${randomUUID()}@eteconectada.invalid`;
    const actor = await db.student.create({
      data: {
        fullName: 'Secretaria fictícia subsequente',
        birthDate: new Date('2000-01-01'),
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
          headers: { Origin: base },
          data: { identifier: email, password },
        })
      ).status(),
    ).toBe(200);
    await page.goto(base + '/secretaria/importacao/subsequente');
    const responseFor = (action: string) =>
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/secretaria/importacao' &&
          response.request().postDataJSON()?.action === action,
      );
    const upload = async (buffer: Buffer) => {
      await page
        .getByLabel('Planilha de alunos do subsequente', { exact: true })
        .setInputFiles({
          name: 'subsequente-ficticio.xls',
          mimeType: 'application/vnd.ms-excel',
          buffer,
        });
      const response = responseFor('inspect');
      await page
        .getByRole('button', { name: 'Ler arquivo', exact: true })
        .click();
      return response;
    };
    expect((await upload(sheetFixture().file())).status()).toBe(422);
    await expect(page.locator('#conteudo').getByRole('alert')).toContainText(
      'Modalidade',
    );
    let lost = false;
    for (const [index, course] of (['DS', 'ADM', 'ENF'] as const).entries()) {
      const stage = course === 'DS' ? 1 : course === 'ADM' ? 3 : 4;
      const fixture = schoolHeaderFixture('SUBSEQUENTE', course, stage);
      const registration = String(1001 + index).padStart(8, '0');
      fixture.wb.Sheets['Fictícia'].A7 = { t: 's', v: registration };
      const inspection = await upload(fixture.file());
      expect(inspection.status()).toBe(200);
      const metadata = await inspection.json();
      scopes.push(metadata.sheets[0].scopeId);
      await expect(
        page.getByRole('link', { name: 'cadastre o calendário', exact: true }),
      ).toHaveCount(0);
      await expect(page.getByLabel('Nome da turma')).toHaveValue(
        `ST${course}N${stage}U`,
      );
      await expect(page.getByLabel('Nome da turma')).toHaveAttribute(
        'readonly',
        '',
      );
      await expect(page.getByLabel('Período letivo')).toHaveValue('2026.2');
      await expect(page.getByText(/Ingresso estimado:/)).toContainText(
        course === 'DS' ? '2026.2' : course === 'ADM' ? '2025.2' : '2025.1',
      );
      expect(
        await db.courseOffering.count(),
        'Inspeção não cria referências.',
      ).toBe(index);
      await page
        .getByRole('button', { name: 'Gerar prévia', exact: true })
        .click();
      await expect(
        page.getByRole('checkbox', { name: /Conferi turma/ }),
      ).toBeFocused();
      await page.getByRole('checkbox', { name: /Conferi turma/ }).check();
      let response = responseFor('preview');
      await page
        .getByRole('button', { name: 'Gerar prévia', exact: true })
        .click();
      expect((await response).status()).toBe(200);
      await expect(
        page.getByRole('heading', { name: 'Confira a prévia', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('region', {
          name: 'Turmas e datas de referência',
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await db.courseOffering.count(),
        'Prévia não cria referências.',
      ).toBe(index);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({
        path: testInfo.outputPath(`turma-${course}-1440.png`),
        fullPage: true,
      });
      await page.setViewportSize({ width: 320, height: 740 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`turma-${course}-320.png`),
        fullPage: true,
      });
      await page
        .getByRole('button', { name: 'Aplicar importação', exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: 'Continuar conferindo', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(
        page.getByRole('button', { name: 'Aplicar importação', exact: true }),
      ).toBeFocused();
      await page
        .getByRole('button', { name: 'Aplicar importação', exact: true })
        .click();
      if (course === 'ENF')
        await page.route('**/api/secretaria/importacao', async (route) => {
          if (route.request().postDataJSON().action === 'confirm' && !lost) {
            lost = true;
            const applied = await route.fetch();
            expect(applied.status()).toBe(200);
            await route.abort('failed');
          } else await route.continue();
        });
      if (course !== 'ENF') response = responseFor('confirm');
      await page
        .getByRole('button', { name: 'Confirmar importação', exact: true })
        .click();
      if (course === 'ENF') {
        await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
          'Resultado não confirmado',
        );
        response = responseFor('confirm');
        await page
          .getByRole('button', { name: 'Confirmar importação', exact: true })
          .click();
      }
      expect((await response).status()).toBe(200);
      await expect(
        page.getByRole('heading', {
          name: 'Importação concluída',
          exact: true,
        }),
      ).toBeVisible();
      const saved = await db.student.findUniqueOrThrow({
        where: { schoolRegistration: registration },
        include: { enrollments: true },
      });
      students.push(saved.id);
      expect(saved.registrationAllowed).toBe(false);
      expect(saved.enrollments).toHaveLength(1);
      expect(saved.enrollments[0].moduleNumber).toBe(stage);
      expect(saved.enrollments[0].progressionHeld).toBe(false);
      expect(saved.enrollments[0].status).toBe('UNCONFIRMED');
      expect(saved.enrollments[0].periodLabel).toBe('2026.2');
      expect(saved.enrollments[0].validFrom!.toISOString().slice(0, 10)).toBe(
        '2026-08-01',
      );
      expect(await db.courseOffering.count()).toBe(index + 1);
      await page
        .getByRole('button', { name: 'Importar outro arquivo', exact: true })
        .click();
      expect((await upload(fixture.file())).status()).toBe(200);
      await page.getByRole('checkbox', { name: /Conferi turma/ }).check();
      response = responseFor('preview');
      await page
        .getByRole('button', { name: 'Gerar prévia', exact: true })
        .click();
      expect((await response).status()).toBe(200);
      await expect(
        page.getByRole('row').filter({ hasText: 'Pessoa Fictícia Um' }),
      ).toContainText('Sem alteração');
      await page
        .getByRole('button', { name: 'Aplicar importação', exact: true })
        .click();
      response = responseFor('confirm');
      await page
        .getByRole('button', { name: 'Confirmar importação', exact: true })
        .click();
      expect((await response).status()).toBe(200);
      await expect(
        page.getByRole('heading', {
          name: 'Importação concluída',
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await db.enrollment.count({ where: { studentId: saved.id } }),
      ).toBe(1);
      expect(
        await db.courseCalendarVersion.count({
          where: { offeringId: scopes[index] },
        }),
      ).toBe(1);
      await page
        .getByRole('button', { name: 'Importar outro arquivo', exact: true })
        .click();
    }
    expect(lost).toBe(true);
    await db.account.update({
      where: { id: actor.account!.id },
      data: { role: 'student' },
    });
    await page.goto(base + '/secretaria/importacao/subsequente');
    await expect(
      page.getByRole('heading', {
        name: 'Acesso restrito à secretaria',
        exact: true,
      }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    try {
      await db.student.deleteMany({ where: { id: { in: students } } });
      await db.courseCalendarVersion.deleteMany({
        where: { offeringId: { in: scopes } },
      });
      await db.courseOffering.deleteMany({ where: { id: { in: scopes } } });
    } finally {
      await env.close();
    }
  }
});
