import { test, expect } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/lib/password';
import { subsequentFixture } from '../../scripts/subsequent-declaration-fixture';

test('subsequente gera com UF e município e secretaria consulta o PDF preenchido automaticamente', async ({
  page,
}) => {
  const { openTestEnvironment } =
    await import('../../scripts/test-environment');
  const previousPreview = process.env.DECLARATION_REGISTRY_PREVIEW;
  const previousOrigin = process.env.PORTAL_PUBLIC_URL;
  process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
  process.env.PORTAL_PUBLIC_URL = 'https://portal.example.invalid';
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const ids: string[] = [];
  const fixture = subsequentFixture('DS', 2);
  const password = 'PortalSintetico#123';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const staff = await db.student.create({
      data: {
        fullName: 'Secretaria fictícia do subsequente',
        birthDate: new Date('1990-01-01T00:00:00Z'),
      },
    });
    ids.push(staff.id);
    const staffAccount = await db.account.create({
      data: {
        studentId: staff.id,
        role: 'secretary',
        status: 'active',
        email: randomUUID() + '@example.invalid',
        passwordHash: await hashPassword(password),
      },
    });
    await db.courseOffering.create({
      data: {
        id: fixture.enrollment.offeringId,
        label: fixture.schedule.label,
        courseLabel: 'DS',
        calendars: {
          create: {
            revision: 1,
            schedule: fixture.schedule,
            createdById: staffAccount.id,
          },
        },
      },
    });
    const { offering, ...enrollment } = fixture.enrollment;
    void offering;
    const student = await db.student.create({
      data: {
        fullName: fixture.student.fullName,
        birthDate: fixture.student.birthDate,
        schoolRegistration: String(randomBytes(4).readUInt32BE()),
        details: {
          create: {
            parentOne: 'Filiação fictícia do subsequente',
            parentageSource: 'SCHOOL_RECORD',
          },
        },
        enrollments: { create: enrollment },
      },
    });
    ids.push(student.id);
    const studentAccount = await db.account.create({
      data: {
        studentId: student.id,
        role: 'student',
        status: 'active',
        email: randomUUID() + '@example.invalid',
        passwordHash: await hashPassword(password),
      },
    });
    async function login(email: string) {
      await page.goto(base + '/login');
      await page.getByLabel('CPF ou e-mail').fill(email);
      await page.getByLabel('Senha', { exact: true }).fill(password);
      const loginResponse = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/api/login',
      );
      await page.getByRole('button', { name: 'Entrar no portal' }).click();
      expect((await loginResponse).status()).toBe(200);
      await page.waitForURL(/\/$/, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/$/);
      await expect(
        page.getByRole('button', { name: 'Abrir menu de serviços' }),
      ).toBeEnabled();
    }
    // A compilação fria de páginas/API no Next dev pode recarregar a aba.
    // Prepare os módulos antes do fluxo que troca aluno e secretaria.
    expect(
      (await page.request.get(base + '/secretaria/declaracoes')).status(),
    ).toBe(200);
    expect(
      (
        await page.request.get(base + '/api/secretaria/documentos/busca')
      ).status(),
    ).toBe(405);
    await login(studentAccount.email!);
    await page.goto(base + '/declaracao');
    await page
      .getByRole('button', { name: 'Gerar declaração', exact: true })
      .click();
    await expect(
      page.getByRole('dialog', { name: 'Onde você nasceu?' }),
    ).toBeVisible();
    await page.getByLabel('Estado de nascimento (UF)').selectOption('PE');
    const cities = page.getByLabel('Município de nascimento', { exact: true });
    await expect(cities).toBeEnabled();
    await page.getByLabel('Pesquisar município').fill('Recife');
    await cities.selectOption('2611606');
    await page
      .getByLabel('Confirmo que este é meu local de nascimento.')
      .check();
    await page
      .getByRole('dialog', { name: 'Onde você nasceu?' })
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
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar', exact: true }).click();
    const downloaded = await event;
    const bytes = await import('node:fs/promises').then(async ({ readFile }) =>
      readFile((await downloaded.path())!),
    );
    expect(bytes).toEqual(Buffer.from(request.document!.archive!.bytes));
    await page.context().clearCookies();
    await login(staffAccount.email!);
    await page.goto(base + '/secretaria/declaracoes');
    await page
      .getByLabel('Modalidade', { exact: true })
      .selectOption('SUBSEQUENTE');
    await page
      .getByLabel('Nome ou matrícula do aluno')
      .fill(student.schoolRegistration!);
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
    const detail = page.getByRole('region', {
      name: 'Detalhes da declaração',
      exact: true,
    });
    await expect(detail).toContainText('2º módulo');
    await expect(detail).toContainText('Desenvolvimento de Sistemas');
    await expect(detail).toContainText('Recife');
    await expect(detail).toContainText('FILIAÇÃO FICTÍCIA DO SUBSEQUENTE');
    await expect(detail).not.toContainText(/frequência/i);
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: test.info().outputPath('subsequente-painel-' + width + '.png'),
        fullPage: true,
      });
    }
    await expect(
      page.getByRole('button', {
        name: /Preparar declaração|Liberar retirada/,
      }),
    ).toHaveCount(0);
    const details = await db.studentDetails.findUniqueOrThrow({
      where: { studentId: student.id },
    });
    expect(details.birthCity).toBe('Recife');
    expect(details.birthState).toBe('PE');
    expect(details.parentOne).toBe('Filiação fictícia do subsequente');
    expect(errors).toEqual([]);
  } finally {
    try {
      await db.declarationCurrentIssue.deleteMany({
        where: { studentId: { in: ids } },
      });
      await db.declarationDocumentAction.deleteMany({
        where: { studentId: { in: ids } },
      });
      await db.declarationRequest.deleteMany({
        where: { studentId: { in: ids } },
      });
      await db.declarationDocument.deleteMany({
        where: { studentId: { in: ids } },
      });
      await db.declarationPdfArchive.deleteMany({
        where: { documents: { none: {} } },
      });
      await db.student.deleteMany({ where: { id: { in: ids } } });
      await db.courseCalendarVersion.deleteMany({
        where: { offeringId: fixture.enrollment.offeringId },
      });
      await db.courseOffering.deleteMany({
        where: { id: fixture.enrollment.offeringId },
      });
    } finally {
      await environment.close();
      if (previousPreview === undefined)
        delete process.env.DECLARATION_REGISTRY_PREVIEW;
      else process.env.DECLARATION_REGISTRY_PREVIEW = previousPreview;
      if (previousOrigin === undefined) delete process.env.PORTAL_PUBLIC_URL;
      else process.env.PORTAL_PUBLIC_URL = previousOrigin;
    }
  }
});
