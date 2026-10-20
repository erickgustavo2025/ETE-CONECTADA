import { syntheticEnrollmentValidity } from '../../scripts/enrollment-fixture';
import { randomBytes, randomInt } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { hashPassword } from '../../src/lib/password';

async function checkRegistration(page: Page) {
  // A rota pode compilar sob demanda no primeiro acesso do ambiente de teste.
  const response = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/registration/check' &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: /Conferir cadastro/ }).click();
  expect((await response).status()).toBe(200);
}

function validCpf() {
  const digits = Array.from({ length: 9 }, () => randomInt(10));
  for (let n = 9; n < 11; n++) {
    const check =
      (digits.reduce((sum, digit, i) => sum + digit * (n + 1 - i), 0) * 10) %
      11;
    digits.push(check === 10 ? 0 : check);
  }
  return digits.join('');
}

async function login(
  page: Page,
  base: string,
  identifier: string,
  password: string,
) {
  await page.goto(`${base}/login`);
  await page.getByLabel('CPF ou e-mail').fill(identifier);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar no portal' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('button', { name: 'Abrir menu de serviços' }),
  ).toBeEnabled();
}

test('primeiro acesso pode ser retomado, confirmado, usado e encerrado', async ({
  page,
}) => {
  const { openTestEnvironment } =
    await import('../../scripts/test-environment');
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const suffix = randomBytes(8).toString('hex');
  let studentId: string | undefined;
  try {
    const student = await db.student.create({
      data: {
        schoolRegistration: `0${randomInt(10000, 99999)}`,
        birthDate: new Date('2008-01-15T00:00:00.000Z'),
        fullName: `Estudante sintético ${suffix}`,
        registrationAllowed: true,
        details: {
          create: {
            parentOne: 'Filiação Fictícia Um',
            parentTwo: 'Filiação Fictícia Dois',
            parentageSource: 'SCHOOL_RECORD',
          },
        },
        enrollments: {
          create: {
            mode: 'INTEGRADO',
            className: `Turma sintética ${suffix}`,
            grade: 2,
            courseLabel: 'DS',
          },
        },
      },
    });
    studentId = student.id;
    await page.goto(`${base}/cadastro`);
    await page.getByLabel('Matrícula').fill(student.schoolRegistration!);
    await page.getByLabel('Data de nascimento').fill('2008-01-15');
    const parent = page.getByLabel('Nome completo do pai ou da mãe');
    await page.getByRole('button', { name: /Conferir cadastro/ }).click();
    await expect(parent).toBeFocused();
    await expect(parent).toHaveAttribute('aria-invalid', 'true');
    await parent.fill('Filiação');
    await page.getByRole('button', { name: /Conferir cadastro/ }).click();
    await expect(page.locator('#identity-error')).toContainText(
      'nome completo',
    );
    await parent.fill('Pessoa Desconhecida');
    await checkRegistration(page);
    await expect(
      page.getByText(
        'Não foi possível confirmar os dados. Confira as informações ou procure a escola.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(await db.account.count({ where: { studentId } })).toBe(0);
    // Falha de conexão permite repetir sem perder os dados digitados.
    await page.route(
      '**/api/registration/check',
      (route) => route.abort('failed'),
      { times: 1 },
    );
    await page.getByRole('button', { name: /Conferir cadastro/ }).click();
    await expect(
      page.getByText(/Confira a conexão e tente novamente/),
    ).toBeVisible();
    await expect(parent).toHaveValue('Pessoa Desconhecida');
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath(`cadastro-filiacao-${width}.png`),
        fullPage: true,
      });
    }
    await page
      .getByLabel('Nome completo do pai ou da mãe')
      .fill('Filiação Fictícia Um');
    await checkRegistration(page);
    await expect(
      page.getByRole('heading', { name: 'Escolha seus dados de acesso' }),
    ).toBeVisible();

    const email = `browser-${suffix}@eteconectada.invalid`;
    const password = 'PortalSintetico#123';
    await page.getByLabel('CPF', { exact: true }).fill(validCpf());
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Nova senha').fill(password);
    await page.getByLabel('Confirme a senha').fill(password);
    await page
      .getByRole('button', { name: /Confirmar dados e enviar link/ })
      .click();
    await expect(
      page.getByRole('link', { name: 'Confirmar conta de teste' }),
    ).toBeVisible();
    const firstUrl = await page
      .getByRole('link', { name: 'Confirmar conta de teste' })
      .getAttribute('href');
    expect(firstUrl).toBeTruthy();

    await page.getByRole('button', { name: 'Fechar' }).click();
    await page.getByLabel('Matrícula').fill(student.schoolRegistration!);
    await page.getByLabel('Data de nascimento').fill('2008-01-15');
    await page
      .getByLabel('Nome completo do pai ou da mãe')
      .fill('FILIACAO FICTICIA DOIS');
    await checkRegistration(page);
    await expect(
      page.getByText(/ainda não foi confirmado\. Use o mesmo CPF/),
    ).toBeVisible();
    const storedCpf = (
      await db.student.findUniqueOrThrow({ where: { id: student.id } })
    ).cpf;
    expect(storedCpf).toBeTruthy();
    await page.getByLabel('CPF', { exact: true }).fill(storedCpf!);
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Nova senha').fill(password);
    await page.getByLabel('Confirme a senha').fill(password);
    await page
      .getByRole('button', { name: /Confirmar dados e enviar link/ })
      .click();
    const renewedUrl = await page
      .getByRole('link', { name: 'Confirmar conta de teste' })
      .getAttribute('href');
    expect(renewedUrl).toBeTruthy();
    expect(renewedUrl).not.toBe(firstUrl);

    await page.goto(firstUrl!);
    await page.getByRole('button', { name: 'Confirmar e-mail' }).click();
    await expect(page.getByText(/inválido ou expirou/i)).toBeVisible();
    await page.goto(renewedUrl!);
    await page.getByRole('button', { name: 'Confirmar e-mail' }).click();
    await expect(
      page.getByText(/E-mail confirmado\. Sua conta está ativa\./),
    ).toBeVisible();

    await login(page, base, email, password);
    // Deixa uma tela privada no histórico antes do logout para conferir a proteção de cache.
    await page.goto(`${base}/declaracao`);
    await page.goto(`${base}/`);
    await page.getByRole('button', { name: 'Abrir menu de serviços' }).click();
    await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole('heading', { name: 'Acesso ao portal', exact: true }),
    ).toBeVisible();
    await page.goto(`${base}/`);
    await expect(page).toHaveURL(/\/login$/);

    const account = await db.account.findUniqueOrThrow({
      where: { studentId: student.id },
    });
    expect(account.status).toBe('active');
  } finally {
    try {
      if (studentId) await db.student.deleteMany({ where: { id: studentId } });
    } finally {
      await environment.close();
    }
  }
});

test('aluno solicita, secretaria gera PDF e libera retirada acompanhada pelo aluno', async ({
  page,
  context,
}) => {
  const { openTestEnvironment } =
    await import('../../scripts/test-environment');
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const suffix = randomBytes(8).toString('hex');
  const password = 'PortalSintetico#123';
  let studentId: string | undefined;
  let secretaryId: string | undefined;
  try {
    const student = await db.student.create({
      data: {
        schoolRegistration: String(randomInt(10000000, 99999999)),
        birthDate: new Date('2008-05-20T00:00:00.000Z'),
        fullName: `Aluno de declaração ${suffix}`,
        details: {
          create: {
            birthCity: 'Recife',
            birthState: 'PE',
            birthCountry: 'BR',
            birthplaceSource: 'SCHOOL_RECORD',
            parentOne: 'Responsável sintético Um',
            parentTwo: 'Responsável sintético Dois',
            parentageSource: 'SCHOOL_RECORD',
          },
        },
        enrollments: {
          create: {
            mode: 'INTEGRADO',
            className: `Turma declaração ${suffix}`,
            ...syntheticEnrollmentValidity(),
            grade: 2,
            courseLabel: 'DS',
          },
        },
      },
      include: { enrollments: true },
    });
    studentId = student.id;
    const secretary = await db.student.create({
      data: {
        fullName: `Secretaria sintética ${suffix}`,
        birthDate: new Date('1990-01-01T00:00:00.000Z'),
        enrollments: {
          create: {
            mode: 'SUBSEQUENTE',
            className: `Equipe ${suffix}`,
            courseLabel: 'DS',
          },
        },
      },
    });
    secretaryId = secretary.id;
    async function createActiveAccount(
      studentId: string,
      role: 'student' | 'secretary',
    ) {
      const account = await db.account.create({
        data: {
          studentId,
          role,
          status: 'active',
          passwordHash: await hashPassword(password),
          email: `${role}-${suffix}@eteconectada.invalid`,
        },
      });
      if (role === 'student')
        await db.student.update({
          where: { id: studentId },
          data: { cpf: validCpf() },
        });
      return account;
    }
    const studentAccount = await createActiveAccount(student.id, 'student');
    const secretaryAccount = await createActiveAccount(
      secretary.id,
      'secretary',
    );
    await page.goto(`${base}/login`);
    await page.getByLabel('CPF ou e-mail').fill(studentAccount.email!);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar no portal' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole('button', { name: 'Abrir menu de serviços' }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Abrir menu de serviços' }).click();
    await page.getByRole('link', { name: 'Declaração de vínculo' }).click();
    await expect(
      page.getByRole('heading', { name: 'Declaração de vínculo' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Solicitar declaração' }).click();
    await page.getByLabel(/Confirmo/).check();
    await page
      .getByRole('button', { name: 'Enviar solicitação', exact: true })
      .click();
    await expect(
      page.getByText('Solicitação enviada. Acompanhe o atendimento abaixo.'),
    ).toBeVisible();
    await expect(page.getByText('Solicitada', { exact: true })).toBeVisible();

    await page.context().clearCookies();
    await login(page, base, secretaryAccount.email!, password);
    await page.goto(`${base}/secretaria/declaracoes`);
    await expect(
      page.getByRole('heading', { name: 'Solicitações dos alunos' }),
    ).toBeVisible();
    await expect(page.getByText(student.fullName!)).toBeVisible();
    await page.getByRole('button', { name: 'Preparar declaração' }).click();
    for (const width of [320, 640, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 320, height: 900 });
    await expect(page.getByLabel('Cidade e estado de nascimento')).toHaveValue(
      'Recife/PE',
    );
    await expect(page.getByLabel('Nome do pai ou da mãe')).toHaveValue(
      'Responsável sintético Um',
    );
    await expect(
      page.getByLabel('Nome do outro pai ou da outra mãe (se houver)'),
    ).toHaveValue('Responsável sintético Dois');
    await expect(page.getByLabel('Nome oficial do curso técnico')).toHaveValue(
      'Desenvolvimento de Sistemas',
    );
    await expect(page.getByLabel('Período letivo')).not.toHaveValue('');
    await page
      .getByLabel('Dias e horários, se necessário')
      .fill('Dias e horários fictícios para teste');
    await expect(
      page.getByText('100%, conforme orientação da secretaria', {
        exact: false,
      }),
    ).toBeVisible();
    await page.getByLabel(/Conferi a matrícula, os dados pessoais/).check();
    const downloadEvent = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Baixar só esta declaração' })
      .click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    const pdfPath = await download.path();
    expect(pdfPath).toBeTruthy();
    const pdf = await import('node:fs/promises').then(({ readFile }) =>
      readFile(pdfPath!),
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    await expect(
      page.getByText(/PDF de teste pronto\. Abra o arquivo/),
    ).toBeVisible();
    const request = await db.declarationRequest.findFirstOrThrow({
      where: { studentId: student.id },
    });
    expect(request.status).toBe('IN_PREPARATION');

    const release = page.getByRole('button', { name: 'Liberar retirada' });
    await release.focus();
    await release.press('Enter');
    await expect(
      page.getByRole('button', { name: 'Ainda não está pronto' }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(release).toBeFocused();
    await release.press('Enter');
    const confirm = page.getByRole('button', {
      name: 'Confirmar retirada disponível',
    });
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/Confirmo que o documento foi impresso/).check();
    await confirm.click();
    await expect(
      page.getByText(/marcada como pronta para retirada/),
    ).toBeVisible();
    const completed = await db.declarationRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(completed.status).toBe('READY_FOR_PICKUP');
    expect(completed.readyAt).toBeTruthy();

    await context.clearCookies();
    await login(page, base, studentAccount.email!, password);
    await page.goto(`${base}/declaracao`);
    await expect(
      page.getByText('Pronta para retirada', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Você já pode buscar na secretaria da escola.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Atualizar status' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /PDF|baixar/i })).toHaveCount(
      0,
    );
  } finally {
    try {
      if (studentId) {
        const ids = [studentId, secretaryId].filter((id): id is string => !!id);
        await db.declarationRequest.deleteMany({
          where: { studentId: { in: ids } },
        });
        await db.account.deleteMany({ where: { studentId: { in: ids } } });
        await db.student.deleteMany({ where: { id: { in: ids } } });
      }
    } finally {
      await environment.close();
    }
  }
});
