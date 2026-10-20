import { test, expect } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { syntheticEnrollmentValidity } from '../../scripts/enrollment-fixture';

test('secretaria separa modalidades, reinicia páginas e recupera falha sem mostrar pedidos antigos', async ({
  page,
}) => {
  const { openTestEnvironment } =
    await import('../../scripts/test-environment');
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
    const group = page.getByRole('group', { name: 'Modalidade do aluno' });
    const integrated = group.getByRole('button', {
      name: 'Integrado',
      exact: true,
    });
    const subsequent = group.getByRole('button', {
      name: 'Subsequente',
      exact: true,
    });
    const requests = page.locator('#staff-request-list');
    await expect(integrated).toHaveAttribute('aria-pressed', 'true');
    await expect(requests.locator('.request-row')).toHaveCount(20);
    await expect(requests).not.toContainText('Aluna fictícia subsequente');
    const pagination = page.getByRole('navigation', {
      name: 'Páginas das solicitações',
    });
    await pagination.getByRole('button', { name: 'Próxima' }).click();
    await expect(requests.locator('.request-row')).toHaveCount(1);
    await expect(pagination).toContainText('2 / 2');

    const blocked = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    let failOnce = true;
    await page.route('**/api/secretaria/solicitacoes?**', async (route) => {
      if (
        failOnce &&
        new URL(route.request().url()).searchParams.get('mode') ===
          'SUBSEQUENTE'
      ) {
        failOnce = false;
        await blocked;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Consulta temporariamente indisponível no ensaio.',
          }),
        });
      } else await route.continue();
    });
    await subsequent.click();
    await expect(
      page.getByText('Consultando solicitações…', { exact: true }),
    ).toBeVisible();
    await expect(requests.locator('.request-row')).toHaveCount(0);
    unblock();
    await expect(
      page.getByRole('status').filter({
        hasText: 'Consulta temporariamente indisponível no ensaio.',
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Tentar novamente', exact: true })
      .click();
    await expect(requests.locator('.request-row')).toHaveCount(2);
    await expect(requests).not.toContainText('Aluno fictício integrado');
    await expect(pagination).toHaveCount(0);
    await page.getByLabel('Situação do pedido').selectOption('IN_PREPARATION');
    await expect(
      page.getByText('Nenhum pedido do Subsequente nesta situação', {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel('Situação do pedido').selectOption('OPEN');
    await expect(requests.locator('.request-row')).toHaveCount(2);
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await integrated.focus();
      await page.keyboard.press('Space');
      await expect(requests.locator('.request-row')).toHaveCount(20);
      await expect(pagination).toContainText('1 / 2');
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: test.info().outputPath('modalidades-' + width + '.png'),
        fullPage: true,
      });
      await subsequent.click();
      await expect(requests.locator('.request-row')).toHaveCount(2);
    }
    await integrated.click();
    await requests
      .getByRole('button', { name: 'Preparar declaração', exact: true })
      .first()
      .click();
    await expect(page.getByLabel('Nome do pai ou da mãe')).toHaveValue(
      'MARIA DA CONCEIÇÃO',
    );
    const otherParent = page.getByLabel(
      'Nome do outro pai ou da outra mãe (se houver)',
    );
    await expect(otherParent).toHaveValue('JOSÉ D’ÁVILA');
    await otherParent.fill('João de Araújo');
    await otherParent.press('Tab');
    await expect(otherParent).toHaveValue('JOÃO DE ARAÚJO');
    const details = await db.studentDetails.findUniqueOrThrow({
      where: { studentId: ids[1] },
    });
    expect(details.parentOne).toBe('Maria da Conceição');
    expect(details.parentTwo).toBe('José d’Ávila');
    expect(errors).toEqual([]);
  } finally {
    unblock();
    try {
      await db.student.deleteMany({ where: { id: { in: ids } } });
    } finally {
      await environment.close();
    }
  }
});
