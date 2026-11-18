import { test, expect } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { syntheticEnrollmentValidity } from '../../scripts/enrollment-fixture';

test('painel consulta pedidos anteriores por modalidade e turma, pagina e recupera falha sem controles de retirada', async ({
  page,
}) => {
  const { openTestEnvironment } =
    await import('../../scripts/test-environment');
  const previous = process.env.DECLARATION_REGISTRY_PREVIEW;
  process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const ids: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let unblock = () => {};
  try {
    const staff = await db.student.create({
      data: {
        fullName: 'Secretaria fictícia da organização',
        birthDate: new Date('1990-01-01'),
      },
    });
    ids.push(staff.id);
    const account = await db.account.create({
      data: {
        studentId: staff.id,
        role: 'secretary',
        status: 'active',
        email: randomBytes(12).toString('hex') + '@example.invalid',
        passwordHash: 'sem-login-no-ensaio',
      },
    });
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        accountId: account.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    await page
      .context()
      .addCookies([{ name: 'ete_portal_session', value: token, url: base }]);
    for (const mode of ['INTEGRADO', 'SUBSEQUENTE'] as const) {
      const student = await db.student.create({
        data: {
          fullName:
            mode === 'INTEGRADO'
              ? 'Aluno fictício integrado'
              : 'Aluna fictícia subsequente',
          birthDate: new Date('2000-01-01'),
          details: {
            create: {
              parentOne: 'Maria da Conceição',
              parentTwo: 'José d’Ávila',
              parentageSource: 'SCHOOL_RECORD',
            },
          },
        },
      });
      ids.push(student.id);
      for (let i = 0; i < (mode === 'INTEGRADO' ? 21 : 2); i++) {
        const enrollment = await db.enrollment.create({
          data: {
            studentId: student.id,
            mode,
            className: mode + ' fictício ' + i,
            courseLabel: 'DS',
            grade: mode === 'INTEGRADO' ? 2 : null,
            moduleNumber: mode === 'SUBSEQUENTE' ? 1 : null,
            ...syntheticEnrollmentValidity(),
          },
        });
        await db.declarationRequest.create({
          data: { studentId: student.id, enrollmentId: enrollment.id },
        });
      }
    }
    await page.goto(base + '/secretaria/declaracoes');
    await expect(
      page.getByRole('heading', {
        name: 'Declarações dos alunos',
        exact: true,
      }),
    ).toBeVisible();
    const submit = page.getByRole('button', {
      name: 'Buscar declarações',
      exact: true,
    });
    await page
      .getByLabel('Consultar', { exact: true })
      .selectOption('requests');
    await page
      .getByLabel('Modalidade', { exact: true })
      .selectOption('INTEGRADO');
    const firstList = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === '/api/secretaria/documentos/busca' &&
        r.request().method() === 'POST' &&
        r.request().postDataJSON().records === 'requests' &&
        r.request().postDataJSON().mode === 'INTEGRADO',
    );
    await submit.click();
    const firstResult = await firstList;
    const firstBody = await firstResult.json();
    expect(firstResult.status()).toBe(200);
    expect(firstBody.total).toBe(21);
    await expect(
      page.getByRole('heading', {
        name: 'Solicitações encontradas: 21',
        exact: true,
      }),
    ).toBeVisible();
    const rows = page
      .locator('li')
      .filter({ hasText: 'Pedido antigo recebido' });
    await expect(rows).toHaveCount(20);
    const next = page.getByRole('button', {
      name: 'Próxima',
      exact: true,
    });
    await next.click();
    await expect(rows).toHaveCount(1);
    const blocked = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    let failOnce = true;
    await page.route('**/api/secretaria/documentos/busca', async (route) => {
      if (route.request().postDataJSON().mode === 'SUBSEQUENTE' && failOnce) {
        failOnce = false;
        await blocked;
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Consulta temporariamente indisponível no ensaio.',
          }),
        });
      }
      await route.continue();
    });
    await page
      .getByLabel('Modalidade', { exact: true })
      .selectOption('SUBSEQUENTE');
    await submit.click();
    await expect(rows).toHaveCount(0);
    unblock();
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Consulta temporariamente indisponível' }),
    ).toContainText('Consulta temporariamente indisponível');
    await page
      .getByRole('button', { name: 'Tentar novamente', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Solicitações encontradas: 2',
        exact: true,
      }),
    ).toBeVisible();
    await expect(rows).toHaveCount(2);
    await expect(page.locator('main')).not.toContainText(
      'Aluno fictício integrado',
    );
    await expect(
      page.getByRole('button', {
        name: /Preparar declaração|Liberar retirada/,
      }),
    ).toHaveCount(0);
    await page
      .getByLabel('Nome exato da turma (opcional)')
      .fill('SUBSEQUENTE fictício 1');
    await submit.click();
    await expect(rows).toHaveCount(1);
    await page.getByLabel('Nome exato da turma (opcional)').fill('');
    await page
      .getByLabel('Situação', { exact: true })
      .selectOption('IN_PREPARATION');
    await submit.click();
    await expect(
      page.getByText(
        'Nenhum documento encontrado com esses filtros. Confira a busca ou procure outra turma e data.',
      ),
    ).toBeVisible();
    await page.getByLabel('Situação', { exact: true }).selectOption('');
    await submit.click();
    await expect(rows).toHaveCount(2);
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
        path: test.info().outputPath('solicitacoes-painel-' + width + '.png'),
        fullPage: true,
      });
    }
    expect(
      await db.declarationRequest.count({
        where: { studentId: { in: ids }, status: 'REQUESTED' },
      }),
    ).toBe(23);
    expect(
      await db.declarationDocument.count({ where: { studentId: { in: ids } } }),
    ).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    unblock();
    {
      await environment.close();
      if (previous === undefined)
        delete process.env.DECLARATION_REGISTRY_PREVIEW;
      else process.env.DECLARATION_REGISTRY_PREVIEW = previous;
    }
  }
});
