import { expect, test } from '@playwright/test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { openTestEnvironment } from '../../scripts/test-environment';

test('secretaria consulta o histórico de ações e o aluno não tem acesso', async ({
  page,
  browser,
}) => {
  const saved = process.env.DECLARATION_REGISTRY_PREVIEW;
  process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
  const env = await openTestEnvironment({ http: true });
  try {
    async function account(fullName: string, role: 'secretary' | 'student') {
      const account = await env.db.account.create({
        data: {
          role,
          status: 'active',
          email: randomUUID() + '@example.invalid',
          passwordHash: 'ficticio',
          student: {
            create: {
              fullName,
              birthDate: new Date('2000-01-01'),
              schoolRegistration: randomBytes(6).toString('hex'),
            },
          },
        },
      });
      const token = randomBytes(32).toString('base64url');
      await env.db.session.create({
        data: {
          accountId: account.id,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + 600_000),
        },
      });
      return {
        ...account,
        cookie: { name: 'ete_portal_session', value: token, url: env.base },
      };
    }

    const staff = await account(
      'Secretária fictícia do histórico',
      'secretary',
    );
    const student = await account('Íris Fictícia do Histórico', 'student');
    const operation = randomUUID();
    const entry = await env.db.studentAccessChange.create({
      data: {
        studentId: student.studentId,
        createdById: staff.id,
        kind: 'ISSUANCE',
        blocked: true,
        revision: 1,
        reason: 'Conferência fictícia de matrícula',
        requestKey: operation,
        createdAt: new Date('2026-11-17T14:30:00Z'),
      },
    });
    const api = env.base + '/api/secretaria/historico';
    const headers = { origin: env.base };
    const studentContext = await browser.newContext();
    try {
      const anonymous = await studentContext.request.post(api, {
        data: {},
        headers,
      });
      expect(anonymous.status()).toBe(401);

      await studentContext.addCookies([student.cookie]);
      const learner = await studentContext.request.post(api, {
        data: { aluno: 'Íris' },
        headers,
      });
      expect(learner.status()).toBe(403);
      const studentPage = await studentContext.newPage();
      await studentPage.goto(env.base + '/secretaria/historico');
      await expect(
        studentPage.getByRole('heading', { name: 'Histórico de ações' }),
      ).toHaveCount(0);
    } finally {
      await studentContext.close();
    }

    await page.context().addCookies([staff.cookie]);
    const crossOrigin = await page.request.post(api, {
      data: {},
      headers: { origin: 'https://outro-site.example.invalid' },
    });
    expect(crossOrigin.status()).toBe(403);
    const readOnly = await page.request.delete(api, { headers });
    expect(readOnly.status()).toBe(405);
    const invalid = await page.request.post(api, {
      data: { operacao: 'excluir' },
      headers,
    });
    expect(invalid.status()).toBe(422);

    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(env.base + '/secretaria/declaracoes');
    await page.getByRole('button', { name: 'Abrir menu de serviços' }).click();
    await page.getByRole('link', { name: 'Histórico de ações' }).click();
    await expect(
      page.getByRole('heading', { name: 'Histórico de ações' }),
    ).toBeVisible();
    const actions = page.getByRole('list', { name: 'Ações registradas' });
    await expect(
      actions.getByText('Novas declarações bloqueadas'),
    ).toBeVisible();
    await expect(
      actions.getByText('Responsável: Secretária fictícia do histórico'),
    ).toBeVisible();
    await expect(
      actions.getByText('Conferência fictícia de matrícula'),
    ).toBeVisible();
    await actions.getByText('Referência do registro').click();
    await expect(actions.getByText('Registro ' + entry.id)).toBeVisible();
    await expect(actions.getByText('Operação ' + operation)).toBeVisible();

    await page.getByLabel('Nome ou matrícula do aluno').fill('IRIS FICTICIA');
    await page.getByLabel('Categoria').selectOption('ACESSO');
    await page.getByLabel('Data inicial').fill('2026-11-17');
    await page.getByLabel('Data final').fill('2026-11-17');
    const [response] = await Promise.all([
      page.waitForResponse(
        (candidate) =>
          candidate.url() === api && candidate.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Buscar', exact: true }).click(),
    ]);
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(await response.text()).not.toContain(staff.email!);
    await expect(
      actions.getByText('Novas declarações bloqueadas'),
    ).toBeVisible();
    expect(new URL(page.url()).search).toBe('');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page.getByLabel('Categoria').selectOption('DECLARACAO');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(page.getByRole('status')).toContainText(
      'Nenhuma ação encontrada',
    );
    await page.getByRole('button', { name: 'Limpar filtros' }).click();
    await expect(
      actions.getByText('Novas declarações bloqueadas'),
    ).toBeVisible();
  } finally {
    try {
      await env.close();
    } finally {
      if (saved === undefined) delete process.env.DECLARATION_REGISTRY_PREVIEW;
      else process.env.DECLARATION_REGISTRY_PREVIEW = saved;
    }
  }
});
