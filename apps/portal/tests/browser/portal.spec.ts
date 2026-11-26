import { syntheticEnrollmentValidity } from '../../scripts/enrollment-fixture';
import { randomBytes, randomInt } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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

test('Turma DevOps libera o primeiro acesso das dez matrículas no banco local', async ({
  page,
}) => {
  const { openTestEnvironment } =
    await import('../../scripts/test-environment');
  const { db, base, close } = await openTestEnvironment({ http: true });
  const prepare = () =>
    execFileSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/prepare-demo.ts', '--turma-devops'],
      {
        cwd: fileURLToPath(new URL('../../', import.meta.url)),
        timeout: 30_000,
      },
    );
  try {
    prepare();
    const students = await db.student.findMany({
      where: {
        enrollments: { some: { className: 'Turma DevOps', status: 'ACTIVE' } },
      },
      include: { details: true },
      orderBy: { schoolRegistration: 'asc' },
    });
    expect(students).toHaveLength(10);
    expect(await db.account.count()).toBe(0);
    const identification = (student: (typeof students)[number]) => ({
      schoolRegistration: student.schoolRegistration!,
      birthDate: student.birthDate.toISOString().slice(0, 10),
      parentName: student.details!.parentOne!,
    });
    for (const student of students.slice(1)) {
      const check = await page.request.post(`${base}/api/registration/check`, {
        headers: { Origin: base },
        data: identification(student),
      });
      expect(await check.json()).toEqual({ result: 'eligible' });
    }

    const identity = identification(students[0]);
    const password = randomBytes(18).toString('base64url');
    const email = 'devops-01@example.invalid';
    await page.goto(`${base}/cadastro`);
    await page.getByLabel('Matrícula').fill(identity.schoolRegistration);
    await page.getByLabel('Data de nascimento').fill(identity.birthDate);
    await page
      .getByLabel('Nome completo do pai ou da mãe')
      .fill(identity.parentName);
    await checkRegistration(page);
    await page.getByLabel('CPF', { exact: true }).fill(students[0].cpf!);
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Nova senha').fill(password);
    await page.getByLabel('Confirme a senha').fill(password);
    await page
      .getByRole('button', { name: /Confirmar dados e enviar link/ })
      .click();
    await page.getByRole('link', { name: 'Confirmar conta de teste' }).click();
    const verification = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/registration/verify',
    );
    await page.getByRole('button', { name: 'Confirmar e-mail' }).click();
    expect((await verification).status()).toBe(200);
    await expect(
      page.getByText(/E-mail confirmado\. Sua conta está ativa\./),
    ).toBeVisible();
    prepare();
    expect(await db.student.count()).toBe(10);
    expect(await db.account.count()).toBe(1);
    await login(page, base, email, password);
  } finally {
    await close();
  }
});

test('primeiro acesso pode ser retomado, confirmado, usado e encerrado', async ({
  page,
}) => {
  const { openTestEnvironment } =
    await import('../../scripts/test-environment');
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const suffix = randomBytes(8).toString('hex');

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
    expect(await db.account.count({ where: { studentId: student.id } })).toBe(
      0,
    );
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
    await environment.close();
  }
});

test('aluno gera PDF e secretaria consulta o mesmo documento sem aprovação por pedido', async ({
  page,
  context,
}) => {
  const { openTestEnvironment } =
    await import('../../scripts/test-environment');
  const previousPreview = process.env.DECLARATION_REGISTRY_PREVIEW;
  const previousOrigin = process.env.PORTAL_PUBLIC_URL;
  process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
  process.env.PORTAL_PUBLIC_URL = 'https://portal.example.invalid';
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const suffix = randomBytes(8).toString('hex');
  const password = 'PortalSintetico#123';

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
    await page
      .getByRole('button', { name: 'Gerar declaração', exact: true })
      .click();
    const birthplace = page.getByRole('dialog', { name: 'Onde você nasceu?' });
    await birthplace
      .getByLabel('Confirmo que este é meu local de nascimento.')
      .check();
    await birthplace
      .getByRole('button', { name: 'Gerar declaração', exact: true })
      .click();
    await expect(
      page.getByText('Disponível para baixar', { exact: true }),
    ).toBeVisible();
    const request = await db.declarationRequest.findFirstOrThrow({
      where: { studentId: student.id },
      include: { document: { include: { archive: true } } },
    });
    expect(request.status).toBe('AVAILABLE');
    expect(request.document?.snapshot).toMatchObject({ mode: 'INTEGRADO' });
    expect(JSON.stringify(request.document?.snapshot)).toContain('100%');
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar', exact: true }).click();
    const download = await downloadEvent;
    const pdf = await import('node:fs/promises').then(async ({ readFile }) =>
      readFile((await download.path())!),
    );
    expect(pdf).toEqual(Buffer.from(request.document!.archive!.bytes));
    await context.clearCookies();
    await login(page, base, secretaryAccount.email!, password);
    await page.goto(base + '/secretaria/declaracoes');
    await expect(
      page.getByRole('heading', {
        name: 'Declarações dos alunos',
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel('Nome ou matrícula do aluno').fill(suffix);
    await page
      .getByRole('button', { name: 'Buscar declarações', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Ver documentos de ' + student.fullName })
      .click();
    await page
      .getByRole('button', {
        name: 'Ver declaração ' + request.document!.id.slice(-8),
      })
      .click();
    await expect(
      page.getByRole('region', {
        name: 'Detalhes da declaração',
        exact: true,
      }),
    ).toContainText('100%');
    await expect(
      page.getByRole('button', {
        name: /Preparar declaração|Liberar retirada/,
      }),
    ).toHaveCount(0);
    expect(
      await db.declarationDocument.count({ where: { studentId: student.id } }),
    ).toBe(1);
    expect(
      (
        await db.declarationRequest.findUniqueOrThrow({
          where: { id: request.id },
        })
      ).status,
    ).toBe('AVAILABLE');
  } finally {
    await environment.close();
    if (previousPreview === undefined)
      delete process.env.DECLARATION_REGISTRY_PREVIEW;
    else process.env.DECLARATION_REGISTRY_PREVIEW = previousPreview;
    if (previousOrigin === undefined) delete process.env.PORTAL_PUBLIC_URL;
    else process.env.PORTAL_PUBLIC_URL = previousOrigin;
  }
});
