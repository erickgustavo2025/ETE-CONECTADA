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
        schoolRegistration: String(randomInt(10000000, 99999999)),
        birthDate: new Date('2008-01-15T00:00:00.000Z'),
        fullName: `Estudante sintético ${suffix}`,
        registrationAllowed: true,
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
    await page.getByRole('button', { name: 'Abrir menu de serviços' }).click();
    await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login$/);
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
    await page.getByLabel('Naturalidade (município/UF)').fill('Recife/PE');
    await page
      .getByLabel('Filiação registrada')
      .fill('Responsável sintético Um');
    await page
      .getByLabel('Segunda filiação, quando aplicável')
      .fill('Responsável sintético Dois');
    await page
      .getByLabel('Nome oficial do curso técnico')
      .fill('Desenvolvimento de Sistemas');
    await page.getByLabel('Período letivo').fill('2026');
    await page
      .getByLabel('Dias e horários, se necessário')
      .fill('Dias e horários fictícios para teste');
    await page.getByLabel('Incluir frequência registrada').check();
    await page.getByLabel('Frequência (%)').fill('100');
    await page.getByLabel('Início da apuração').fill('2026-02-01');
    await page.getByLabel('Fim da apuração').fill('2026-10-12');
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
    await expect(page.getByText(/PDF pronto\. Abra o arquivo/)).toBeVisible();
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
