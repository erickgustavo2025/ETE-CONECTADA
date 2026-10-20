import { test, expect } from '@playwright/test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { syntheticEnrollmentValidity } from '../../scripts/enrollment-fixture';

test('aluno confirma UF e município no pedido sem chamadas por letra nem alterar outra conta', async ({
  page,
}) => {
  const { openTestEnvironment } =
    await import('../../scripts/test-environment');
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const ids: string[] = [];
  try {
    for (const fullName of [
      'Aluno fictício do modal',
      'Outro aluno fictício do modal',
    ]) {
      ids.push(
        (
          await db.student.create({
            data: {
              fullName,
              birthDate: new Date('2008-01-01T00:00:00Z'),
              schoolRegistration: String(
                Math.floor(Math.random() * 1e7),
              ).padStart(7, '0'),
              details: {
                create: {
                  parentOne: 'Filiação fictícia',
                  parentageSource: 'SCHOOL_RECORD',
                },
              },
              enrollments: {
                create: {
                  mode: 'INTEGRADO',
                  courseLabel: 'DS',
                  className: 'Turma fictícia',
                  grade: 2,
                  ...syntheticEnrollmentValidity(),
                },
              },
            },
          })
        ).id,
      );
    }
    const account = await db.account.create({
      data: {
        studentId: ids[0],
        role: 'student',
        status: 'active',
        email: `${randomUUID()}@example.invalid`,
        passwordHash: 'hash-ficticio',
      },
    });
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
        accountId: account.id,
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    expect(
      (await page.request.get(`${base}/api/localidades?uf=PE`)).status(),
    ).toBe(401);
    await page.context().addCookies([
      {
        name: 'ete_portal_session',
        value: token,
        url: base,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    expect(
      (await page.request.get(`${base}/api/localidades?uf=__proto__`)).status(),
    ).toBe(422);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${base}/declaracao`);
    const button = page.getByRole('button', {
      name: 'Solicitar declaração',
      exact: true,
    });
    await button.click();
    const dialog = page.getByRole('dialog', { name: 'Onde você nasceu?' });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel('Estado de nascimento (UF)')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(button).toBeFocused();
    await button.click();
    let firstLoad = true;
    await page.route('**/api/localidades?uf=PE', async (route) => {
      if (firstLoad) {
        firstLoad = false;
        await route.fulfill({
          status: 503,
          json: { error: 'Falha sintética no catálogo.' },
        });
      } else await route.continue();
    });

    let calls = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/localidades') calls++;
    });
    await page.getByLabel('Estado de nascimento (UF)').selectOption('PE');
    await expect(page.getByText('Falha sintética no catálogo.')).toBeVisible();
    await page
      .getByRole('button', { name: 'Tentar novamente', exact: true })
      .click();
    const cities = page.getByLabel('Município de nascimento', { exact: true });
    await expect(cities).toBeEnabled();
    await page.getByLabel('Pesquisar município').fill('cidade-que-nao-existe');
    await expect(page.getByText(/Nenhum município encontrado/)).toBeVisible();
    await page
      .getByRole('button', { name: 'Limpar pesquisa de município' })
      .click();
    await page.getByLabel('Pesquisar município').fill('reCífe');
    await expect(cities.locator('option')).toHaveCount(2);
    await cities.selectOption('2611606');
    expect(calls).toBe(2);
    await page.getByLabel('Estado de nascimento (UF)').selectOption('DF');
    await expect(
      cities.getByRole('option', { name: 'Brasília', exact: true }),
    ).toHaveCount(1);
    await expect(cities).toHaveValue('');
    await page.getByLabel('Estado de nascimento (UF)').selectOption('PE');
    await expect(
      cities.getByRole('option', { name: 'Recife', exact: true }),
    ).toHaveCount(1);
    await expect(cities).toHaveValue('');
    await cities.selectOption('2611606');
    expect(calls).toBe(3);
    const screenshot = test.info().outputPath('modal-naturalidade.png');
    await dialog.screenshot({ path: screenshot });
    console.log(`EC069 imagem fictícia: ${screenshot}`);
    await page
      .getByLabel('Confirmo que este é meu local de nascimento.')
      .check();
    await page.route('**/api/declaracao/solicitacoes', (route) =>
      route.fulfill({
        status: 503,
        json: { error: 'Falha sintética no pedido.' },
      }),
    );
    await page
      .getByRole('button', { name: 'Enviar solicitação', exact: true })
      .click();
    await expect(dialog.getByText('Falha sintética no pedido.')).toBeVisible();
    await expect(cities).toHaveValue('2611606');
    expect(await db.declarationRequest.count()).toBe(0);
    await page.unroute('**/api/declaracao/solicitacoes');
    await page
      .getByRole('button', { name: 'Enviar solicitação', exact: true })
      .click();

    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByText('Solicitação enviada. Acompanhe o atendimento abaixo.'),
    ).toBeVisible();
    const details = await db.studentDetails.findUniqueOrThrow({
      where: { studentId: ids[0] },
    });
    expect(details.birthCity).toBe('Recife');
    expect(details.birthState).toBe('PE');
    expect(details.birthplaceSource).toBe('STUDENT_DECLARATION');
    expect(details.parentOne).toBe('Filiação fictícia');
    expect(
      (
        await db.studentDetails.findUniqueOrThrow({
          where: { studentId: ids[1] },
        })
      ).birthCity,
    ).toBeNull();
    expect(await db.declarationRequest.count()).toBe(1);
    // Uma nova abertura não restaura silenciosamente uma opção filtrada.
    await db.declarationRequest.deleteMany({ where: { studentId: ids[0] } });
    await page.reload();
    await page
      .getByRole('button', { name: 'Solicitar declaração', exact: true })
      .click();
    await expect(
      page.getByLabel('Município de nascimento', { exact: true }),
    ).toBeEnabled();
    await page
      .getByLabel('Pesquisar município')
      .fill('municipio-nao-encontrado');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Voltar', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Solicitar declaração', exact: true })
      .click();
    await expect(page.getByText(/Nenhum município encontrado/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Enviar solicitação', exact: true }),
    ).toBeDisabled();

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  } finally {
    try {
      await db.student.deleteMany({ where: { id: { in: ids } } });
    } finally {
      await environment.close();
    }
  }
});
