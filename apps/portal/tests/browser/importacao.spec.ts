import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import { sheetFixture } from '../../scripts/test-sheet-input';
import { hashPassword } from '../../src/lib/password';

// Banco e XLS inteiramente sintéticos. Não usa planilhas ou portal da equipe.
test('secretaria confere e importa integrado, preserva vínculos e recupera confirmação incerta', async ({
  page,
}, testInfo) => {
  const { openTestEnvironment } =
    await import('../../scripts/test-environment');
  const env = await openTestEnvironment({ http: true });
  const { db, base } = env;
  let actorId: string | undefined;
  const registrations = [
    '00001001',
    ...Array.from({ length: 21 }, (_, i) => String(1100 + i).padStart(8, '0')),
  ];
  const password = 'ImportacaoSintetica#123';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.name));
  try {
    expect(await db.student.count()).toBe(0);
    const actor = await db.student.create({
      data: {
        fullName: 'Secretaria sintética importação',
        birthDate: new Date('2000-01-01'),
        account: {
          create: {
            email: `import-${randomUUID()}@eteconectada.invalid`,
            status: 'active',
            role: 'secretary',
            passwordHash: await hashPassword(password),
          },
        },
      },
      include: { account: true },
    });
    actorId = actor.id;
    const student = await db.student.create({
      data: {
        schoolRegistration: '00001001',
        fullName: 'Pessoa Fictícia Um',
        birthDate: new Date('2008-02-29'),
        registrationAllowed: false,
        account: {
          create: {
            email: `student-${randomUUID()}@eteconectada.invalid`,
            status: 'active',
            role: 'student',
            passwordHash: await hashPassword(password),
          },
        },
        enrollments: {
          create: [
            {
              mode: 'INTEGRADO',
              courseLabel: 'ADM',
              grade: 1,
              className: 'Turma antiga sintética',
              periodLabel: '2025',
            },
            {
              mode: 'SUBSEQUENTE',
              courseLabel: 'ENF',
              moduleNumber: 1,
              className: 'Enfermagem preservada',
              periodLabel: '2026.2',
            },
          ],
        },
      },
      include: { account: true, enrollments: true },
    });
    const integrated = student.enrollments.find((e) => e.mode === 'INTEGRADO')!;
    const subsequent = student.enrollments.find(
      (e) => e.mode === 'SUBSEQUENTE',
    )!;
    const fixture = sheetFixture();
    XLSX.utils.sheet_add_aoa(
      fixture.wb.Sheets['Fictícia'],
      registrations
        .slice(1)
        .map((registration, i) => [
          registration,
          `Pessoa Sintética ${i + 2}`,
          '01/01/2008',
          '',
          '',
          '',
          '',
          '',
          '',
        ]),
      { origin: 'A8' },
    );
    const upload = (data: Buffer) => ({
      name: 'integrado-ficticio.xls',
      mimeType: 'application/vnd.ms-excel',
      buffer: data,
    });
    const responseFor = (action: string) =>
      page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === '/api/secretaria/importacao' &&
          r.request().postDataJSON()?.action === action,
      );
    const inspect = async (buffer: Buffer) => {
      await page
        .getByLabel('Planilha de alunos do integrado')
        .setInputFiles(upload(buffer));
      const response = responseFor('inspect');
      await page.getByRole('button', { name: 'Ler arquivo' }).click();
      return (await response).status();
    };
    const preview = async () => {
      const response = responseFor('preview');
      await page.getByRole('button', { name: 'Gerar prévia' }).click();
      const received = await response;
      const value = await received.json();
      expect(
        received.status(),
        value.error || 'Prévia autorizada deve funcionar.',
      ).toBe(200);
      await expect(
        page.getByRole('heading', { name: 'Confira a prévia' }),
      ).toBeVisible();
    };
    await page.goto(`${base}/login`);
    await page.getByLabel('CPF ou e-mail').fill(actor.account!.email!);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar no portal' }).click();
    await expect(page).toHaveURL(`${base}/`);
    await page.getByRole('button', { name: 'Abrir menu de serviços' }).click();
    await page
      .getByRole('link', { name: 'Importar alunos do integrado', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Importar alunos do integrado',
        exact: true,
      }),
    ).toBeVisible();
    expect(await inspect(sheetFixture('SUBSEQUENTE').file())).toBe(422);
    await expect(page.locator('#conteudo').getByRole('alert')).toContainText(
      'Modalidade divergente',
    );
    let releaseRead!: () => void;
    const waitingRead = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    await page.route(
      '**/api/secretaria/importacao',
      async (route) => {
        await waitingRead;
        await route.abort();
      },
      { times: 1 },
    );
    await page
      .getByLabel('Planilha de alunos do integrado')
      .setInputFiles(upload(fixture.file()));
    const heldRequest = page.waitForRequest(
      (r) => new URL(r.url()).pathname === '/api/secretaria/importacao',
    );
    await page.getByRole('button', { name: 'Ler arquivo' }).click();
    await heldRequest;
    await expect(
      page.getByRole('button', { name: 'Ler arquivo' }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Cancelar leitura' }).click();
    await expect(page.locator('#conteudo').getByRole('alert')).toContainText(
      'Leitura interrompida',
    );
    releaseRead();
    await page.unrouteAll({ behavior: 'wait' });
    expect(await inspect(fixture.file())).toBe(200);
    expect(await db.sheetImportPreview.count()).toBe(0);
    await page.setViewportSize({ width: 320, height: 740 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByLabel('Turma e ingresso').selectOption('new');
    await page.getByLabel('Nome da turma').fill('Turma integrada sintética');
    await page.getByLabel('Período letivo').fill('2026');
    await page.getByRole('button', { name: 'Gerar prévia' }).click();
    await expect(
      page.getByRole('checkbox', { name: /Conferi turma/ }),
    ).toBeFocused();
    await expect(page.locator('#conteudo').getByRole('alert')).toContainText(
      'Marque',
    );
    await page.getByRole('checkbox', { name: /Conferi turma/ }).check();
    await preview();
    await page.screenshot({
      path: testInfo.outputPath('previa-320.png'),
      fullPage: true,
    });
    expect(await db.student.count()).toBe(2);
    await expect(
      page.getByRole('button', { name: 'Aplicar importação' }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Próxima página' }).click();
    await expect(page.getByText('Página 2 de 2')).toBeVisible();
    await page.getByLabel('Mostrar na prévia').selectOption('conflict');
    await expect(page.getByText('Página 1 de 1')).toBeVisible();
    await page
      .getByRole('button', { name: 'Selecionar matrícula encontrada' })
      .click();
    await expect(
      page.getByLabel('Escolha a matrícula do aluno 00001001'),
    ).toHaveValue(integrated.id);
    await page
      .getByRole('button', { name: 'Conferir matrículas escolhidas' })
      .click();
    await page.getByRole('checkbox', { name: /Conferi turma/ }).check();
    await preview();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: testInfo.outputPath('previa-desktop.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Aplicar importação' }).click();
    await expect(
      page.getByRole('button', { name: 'Continuar conferindo' }),
    ).toBeFocused();
    await expect(
      page.getByRole('button', { name: 'Confirmar importação', exact: true }),
    ).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Aplicar importação' }),
    ).toBeFocused();
    await page.getByRole('button', { name: 'Aplicar importação' }).click();
    await page.getByRole('checkbox', { name: /Conferi as alterações/ }).check();
    await db.enrollment.update({
      where: { id: integrated.id },
      data: { className: 'Conferência posterior sintética' },
    });
    let response = responseFor('confirm');
    await page
      .getByRole('button', { name: 'Confirmar importação', exact: true })
      .click();
    expect((await response).status()).toBe(409);
    await expect(page.locator('#conteudo').getByRole('alert')).toContainText(
      'mudaram após a prévia',
    );
    expect(await db.student.count()).toBe(2);
    expect(await db.enrollmentImportHistory.count()).toBe(0);
    await preview();
    let loseResponse = true;
    await page.route('**/api/secretaria/importacao', async (route) => {
      if (route.request().postDataJSON().action === 'confirm' && loseResponse) {
        loseResponse = false;
        const applied = await route.fetch();
        expect(applied.status()).toBe(200);
        await route.abort('failed');
      } else await route.continue();
    });
    await page.getByRole('button', { name: 'Aplicar importação' }).click();
    await page.getByRole('checkbox', { name: /Conferi as alterações/ }).check();
    await page
      .getByRole('button', { name: 'Confirmar importação', exact: true })
      .click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
      'Resultado não confirmado',
    );
    expect(await db.student.count()).toBe(23);
    expect(await db.enrollmentImportHistory.count()).toBe(1);
    response = responseFor('confirm');
    await page
      .getByRole('button', { name: 'Confirmar importação', exact: true })
      .click();
    expect((await response).status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'Importação concluída' }),
    ).toBeVisible();
    expect(await db.student.count()).toBe(23);
    expect(await db.account.count()).toBe(2);
    expect(await db.enrollmentImportHistory.count()).toBe(1);
    expect(
      await db.account.findUnique({ where: { id: student.account!.id } }),
    ).toEqual(student.account);
    expect(
      await db.enrollment.findUnique({ where: { id: subsequent.id } }),
    ).toEqual(subsequent);
    expect(
      (await db.student.findUniqueOrThrow({ where: { id: student.id } }))
        .registrationAllowed,
    ).toBe(false);
    const sessionsBefore = await db.session.count();
    await page.getByRole('button', { name: 'Importar outro arquivo' }).click();
    expect(await inspect(fixture.file())).toBe(200);
    const imported = await db.enrollment.findUniqueOrThrow({
      where: { id: integrated.id },
    });
    const scopeId = imported.schoolImportKey!.split(':')[1];
    await page.getByLabel('Turma e ingresso').selectOption(scopeId);
    await expect(page.getByLabel('Nome da turma')).toHaveValue(
      'Turma integrada sintética',
    );
    await expect(page.getByLabel('Período letivo')).toHaveValue('2026');
    await page.getByRole('checkbox', { name: /Conferi turma/ }).check();
    await preview();
    await page.getByRole('button', { name: 'Aplicar importação' }).click();
    response = responseFor('confirm');
    await page
      .getByRole('button', { name: 'Confirmar importação', exact: true })
      .click();
    expect((await response).status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'Importação concluída' }),
    ).toBeVisible();
    expect(await db.enrollmentImportHistory.count()).toBe(1);
    expect(await db.session.count()).toBe(sessionsBefore);
    await page.getByRole('button', { name: 'Importar outro arquivo' }).click();
    expect(await inspect(fixture.file())).toBe(200);
    await page.getByRole('link', { name: 'Página inicial' }).click();
    await expect(
      page.getByRole('heading', { name: 'Descartar esta conferência?' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continuar conferindo' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.getByRole('link', { name: 'Página inicial' }).click();
    await page
      .getByRole('button', { name: 'Descartar conferência', exact: true })
      .click();
    await expect(page).toHaveURL(`${base}/`);
    await db.account.update({
      where: { id: actor.account!.id },
      data: { role: 'student' },
    });
    await page.goto(`${base}/secretaria/importacao/integrado`);
    await expect(
      page.getByRole('heading', { name: 'Acesso restrito à secretaria' }),
    ).toBeVisible();
    await expect(
      page.getByLabel('Planilha de alunos do integrado'),
    ).toHaveCount(0);
    const forbidden = await page.request.post(
      `${base}/api/secretaria/importacao`,
      {
        headers: { Origin: base },
        data: {
          action: 'inspect',
          mode: 'INTEGRADO',
          fileBase64: fixture.file().toString('base64'),
        },
      },
    );
    expect(forbidden.status()).toBe(403);
    await db.session.deleteMany({ where: { accountId: actor.account!.id } });
    await page.goto(`${base}/secretaria/importacao/integrado`);
    await expect(page).toHaveURL(`${base}/login`);
    expect(errors).toEqual([]);
  } finally {
    try {
      await db.student.deleteMany({
        where: {
          OR: [
            ...(actorId ? [{ id: actorId }] : []),
            { schoolRegistration: { in: registrations } },
          ],
        },
      });
    } finally {
      await env.close();
    }
  }
});
