import { test, expect } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/lib/password';
import { subsequentFixture } from '../../scripts/subsequent-declaration-fixture';

test('subsequente pede com UF e município e secretaria baixa modelo preenchido pelo calendário', async ({
  page,
}) => {
  const { openTestEnvironment } =
    await import('../../scripts/test-environment');
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
    await login(studentAccount.email!);
    await page.goto(base + '/declaracao');
    await page
      .getByRole('button', { name: 'Solicitar declaração', exact: true })
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
      .getByRole('button', { name: 'Enviar solicitação', exact: true })
      .click();
    await expect(
      page.getByText('Solicitação enviada. Acompanhe o atendimento abaixo.'),
    ).toBeVisible();
    await page.context().clearCookies();
    await login(staffAccount.email!);
    await page.goto(base + '/secretaria/declaracoes');
    await page
      .getByRole('button', { name: 'Subsequente', exact: true })
      .click();
    await page.getByRole('button', { name: 'Preparar declaração' }).click();
    await expect(page.getByLabel('Cidade e estado de nascimento')).toHaveValue(
      'Recife/PE',
    );
    await expect(page.getByLabel('Nome do pai ou da mãe')).toHaveValue(
      'FILIAÇÃO FICTÍCIA DO SUBSEQUENTE',
    );
    const course = page.getByLabel('Nome oficial do curso técnico');
    await expect(course).toHaveValue('Desenvolvimento de Sistemas');
    await expect(course).toHaveAttribute('readonly', '');
    await expect(page.getByLabel('Período letivo')).toHaveValue(
      fixture.enrollment.periodLabel,
    );
    await expect(page.getByLabel('Dias e horários, se necessário')).toHaveValue(
      'de segunda-feira a sexta-feira, das 18h20 às 21h00',
    );
    await expect(
      page.getByText('2º módulo · Início do curso:', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText('Este modelo não informa frequência.', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Frequência do integrado' }),
    ).toHaveCount(0);
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
        path: test.info().outputPath(`subsequente-preenchido-${width}.png`),
        fullPage: true,
      });
    }
    await page.getByLabel(/Conferi a matrícula, os dados pessoais/).check();
    const downloadEvent = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Baixar só esta declaração' })
      .click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    expect(await download.failure()).toBeNull();
    const request = await db.declarationRequest.findFirstOrThrow({
      where: { studentId: student.id },
    });
    expect(request.status).toBe('IN_PREPARATION');
    const details = await db.studentDetails.findUniqueOrThrow({
      where: { studentId: student.id },
    });
    expect(details.birthCity).toBe('Recife');
    expect(details.birthState).toBe('PE');
    expect(details.parentOne).toBe('Filiação fictícia do subsequente');
    expect(errors).toEqual([]);
  } finally {
    try {
      await db.student.deleteMany({ where: { id: { in: ids } } });
      await db.courseCalendarVersion.deleteMany({
        where: { offeringId: fixture.enrollment.offeringId },
      });
      await db.courseOffering.deleteMany({
        where: { id: fixture.enrollment.offeringId },
      });
    } finally {
      await environment.close();
    }
  }
});
