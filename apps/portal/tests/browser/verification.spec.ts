import { test, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { openTestEnvironment } from '../../scripts/test-environment';
import { syntheticEnrollmentValidity } from '../../scripts/enrollment-fixture';
import { issueDeclaration } from '../../src/lib/declaration-issuance';
import { changeDeclarationDocument } from '../../src/lib/declaration-document-actions';

test('QR consulta registro sem login, confere nome/PDF local e acompanha substituição, cancelamento e falhas', async ({
  page,
}) => {
  const previous = process.env.DECLARATION_REGISTRY_PREVIEW,
    previousOrigin = process.env.PORTAL_PUBLIC_URL;
  process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
  const env = await openTestEnvironment({ http: true });
  const { db, base } = env;
  process.env.PORTAL_PUBLIC_URL = base;
  const ids: string[] = [],
    errors: string[] = [],
    bodies: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/api/documentos/verificacao'))
      bodies.push(request.postData() ?? '');
  });
  try {
    const fullName =
      'Pessoa Fictícia de Verificação ' + randomBytes(4).toString('hex');
    const person = await db.student.create({
      data: {
        fullName,
        birthDate: new Date('2000-01-01'),
        details: {
          create: {
            parentOne: 'Filiação privada fictícia',
            parentageSource: 'SCHOOL_RECORD',
            birthCity: 'Recife',
            birthState: 'PE',
            birthCountry: 'BR',
            birthplaceSource: 'SCHOOL_RECORD',
          },
        },
      },
    });
    ids.push(person.id);
    const account = await db.account.create({
      data: {
        studentId: person.id,
        email: randomUUID() + '@example.invalid',
        passwordHash: 'ficticio',
        role: 'student',
        status: 'active',
      },
    });
    const staffStudent = await db.student.create({
      data: {
        fullName: 'Secretaria fictícia',
        birthDate: new Date('2000-01-01'),
      },
    });
    ids.push(staffStudent.id);
    const staff = await db.account.create({
      data: {
        studentId: staffStudent.id,
        email: randomUUID() + '@example.invalid',
        passwordHash: 'ficticio',
        role: 'secretary',
        status: 'active',
      },
    });
    const enrollment = await db.enrollment.create({
      data: {
        studentId: person.id,
        mode: 'INTEGRADO',
        className: '2A DS fictícia',
        grade: 2,
        courseLabel: 'DS',
        ...syntheticEnrollmentValidity(),
      },
    });
    const first = await issueDeclaration(account.id, {
      enrollmentId: enrollment.id,
      requestKey: randomUUID(),
    });
    const stored = await db.declarationDocument.findUniqueOrThrow({
      where: { id: first.document.id },
      include: { archive: true },
    });
    expect(stored.archive).not.toBeNull();
    await page.goto(base + '/validar/' + first.document.publicCode);
    const update = page.getByRole('button', {
      name: 'Atualizar consulta',
      exact: true,
    });
    await expect(
      page.getByRole('heading', {
        name: 'Registro válido para teste',
        exact: true,
      }),
    ).toBeVisible();
    await expect(update).toBeEnabled();
    await expect(page.getByText(fullName, { exact: true })).toHaveCount(0);
    await expect(
      page.getByText('Filiação privada fictícia', { exact: true }),
    ).toHaveCount(0);
    const confirm = page.getByRole('button', {
      name: 'Conferir nome',
      exact: true,
    });
    await confirm.click();
    await expect(page.getByLabel('Nome completo na declaração')).toBeFocused();
    const beforeBlank = bodies.length;
    await page.getByLabel('Nome completo na declaração').fill('  ');
    await confirm.click();
    await expect(
      page.getByText('Informe o nome completo como aparece na declaração.', {
        exact: true,
      }),
    ).toBeVisible();
    expect(bodies.length).toBe(beforeBlank);
    await page.getByLabel('Nome completo na declaração').fill(fullName);
    await confirm.click();
    await expect(
      page.getByText('O nome confere com o registro.', { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel('Nome completo na declaração')
      .fill('Nome diferente fictício');
    await confirm.click();
    await expect(
      page.getByText(
        'O nome não confere. Confira como está escrito no documento.',
        { exact: true },
      ),
    ).toBeVisible();
    let release!: () => void, reached!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const received = new Promise<void>((resolve) => {
      reached = resolve;
    });
    await page.route(
      '**/api/documentos/verificacao',
      async (route) => {
        const result = await route.fetch();
        reached();
        await gate;
        await route.fulfill({ response: result });
      },
      { times: 1 },
    );
    await page.getByLabel('Nome completo na declaração').fill(fullName);
    await confirm.click();
    await received;
    try {
      await page
        .getByLabel('Nome completo na declaração')
        .fill('Nome digitado enquanto aguarda');
    } finally {
      release();
    }
    await expect(update).toBeEnabled();
    await expect(page.getByLabel('Nome completo na declaração')).toHaveValue(
      'Nome digitado enquanto aguarda',
    );
    await expect(
      page.getByText('O nome confere com o registro.', { exact: true }),
    ).toHaveCount(0);
    const file = page.getByLabel('Selecione o PDF para comparar (opcional)', {
      exact: true,
    });
    await file.setInputFiles({
      name: 'original.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(stored.archive!.bytes),
    });
    await expect(
      page.getByText('O arquivo é igual ao PDF original deste registro.', {
        exact: true,
      }),
    ).toBeVisible();
    await file.setInputFiles({
      name: 'alterado.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.concat([
        Buffer.from(stored.archive!.bytes),
        Buffer.from('\n% arquivo alterado'),
      ]),
    });
    await expect(
      page.getByText('O arquivo é diferente do PDF original deste registro.', {
        exact: true,
      }),
    ).toBeVisible();
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath('validacao-' + width + '.png'),
        fullPage: true,
      });
    }
    const second = await issueDeclaration(account.id, {
      enrollmentId: enrollment.id,
      requestKey: randomUUID(),
    });
    await update.click();
    await expect(
      page.getByRole('heading', {
        name: 'Declaração substituída',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Registro válido para teste',
        exact: true,
      }),
    ).toHaveCount(0);
    await page.goto(base + '/validar/' + second.document.publicCode);
    await expect(
      page.getByRole('heading', {
        name: 'Registro válido para teste',
        exact: true,
      }),
    ).toBeVisible();
    await expect(update).toBeEnabled();
    await changeDeclarationDocument(
      {
        documentId: second.document.id,
        action: 'CANCELLED',
        reason: 'Cancelamento fictício para navegador',
        successorId: null,
      },
      staff.id,
    );
    await page.evaluate(() =>
      document.dispatchEvent(new Event('visibilitychange')),
    );
    await expect(
      page.getByRole('heading', { name: 'Declaração cancelada', exact: true }),
    ).toBeVisible();
    await page.route(
      '**/api/documentos/verificacao',
      (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Indisponível' }),
        }),
      { times: 1 },
    );
    await update.click();
    await expect(
      page.getByRole('heading', { name: 'Consulta indisponível', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        'Não foi possível consultar agora. Isso não significa que a declaração é inválida.',
        { exact: true },
      ),
    ).toBeVisible();
    await update.click();
    await expect(
      page.getByRole('heading', { name: 'Declaração cancelada', exact: true }),
    ).toBeVisible();
    await page.route(
      '**/api/documentos/verificacao',
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ state: 'VALID' }),
        }),
      { times: 1 },
    );
    await update.click();
    await expect(
      page.getByRole('heading', { name: 'Consulta indisponível', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Registro válido para teste',
        exact: true,
      }),
    ).toHaveCount(0);
    await update.click();
    await expect(
      page.getByRole('heading', { name: 'Declaração cancelada', exact: true }),
    ).toBeVisible();
    for (const body of bodies) {
      expect(
        Object.keys(JSON.parse(body)).every((key) =>
          ['code', 'fullName'].includes(key),
        ),
      ).toBe(true);
      expect(body.includes('%PDF-')).toBe(false);
      expect(body.includes('original.pdf')).toBe(false);
    }
    await page.goto(base + '/validar/' + randomBytes(32).toString('base64url'));
    await expect(
      page.getByRole('heading', { name: 'Código não encontrado', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Nome completo na declaração')).toHaveCount(0);
    expect(new URL(page.url()).search).toBe('');
    expect(errors).toEqual([]);
  } finally {
    try {
      await db.declarationCurrentIssue.deleteMany({
        where: { studentId: { in: ids } },
      });
      await db.declarationDocumentAction.deleteMany({
        where: { studentId: { in: ids } },
      });
      await db.declarationDocument.deleteMany({
        where: { studentId: { in: ids } },
      });
      await db.declarationPdfArchive.deleteMany({
        where: { documents: { none: {} } },
      });
      await db.student.deleteMany({ where: { id: { in: ids } } });
      await db.accessAttemptBucket.deleteMany();
    } finally {
      await env.close();
      if (previous === undefined)
        delete process.env.DECLARATION_REGISTRY_PREVIEW;
      else process.env.DECLARATION_REGISTRY_PREVIEW = previous;
      if (previousOrigin === undefined) delete process.env.PORTAL_PUBLIC_URL;
      else process.env.PORTAL_PUBLIC_URL = previousOrigin;
    }
  }
});
