import { test, expect } from '@playwright/test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { openTestEnvironment } from '../../scripts/test-environment';
import { syntheticEnrollmentValidity } from '../../scripts/enrollment-fixture';

test('secretaria consulta minutas e registra cancelamento/substituição com recuperação de rede', async ({
  page,
}) => {
  const previous = process.env.DECLARATION_REGISTRY_PREVIEW;
  process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
  const env = await openTestEnvironment({ http: true });
  const { db, base } = env;
  const ids: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const tag = randomBytes(6).toString('hex');
    for (const name of [
      'Secretaria sintética ' + tag,
      'Aluno sintético ' + tag,
    ]) {
      const s = await db.student.create({
        data: { fullName: name, birthDate: new Date('2008-01-01') },
      });
      ids.push(s.id);
    }
    const actor = await db.account.create({
      data: {
        studentId: ids[0],
        email: tag + '@example.invalid',
        passwordHash: 'ficticio',
        role: 'secretary',
        status: 'active',
      },
    });
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        accountId: actor.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    await page.context().addCookies([
      {
        name: 'ete_portal_session',
        value: token,
        url: base,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const e = await db.enrollment.create({
      data: {
        studentId: ids[1],
        mode: 'INTEGRADO',
        className: '1A DS',
        grade: 1,
        courseLabel: 'DS',
        ...syntheticEnrollmentValidity(),
      },
    });
    const docs: { id: string }[] = [];
    for (let i = 0; i < 3; i++)
      docs.push(
        await db.declarationDocument.create({
          data: {
            id: randomUUID(),
            publicCode: randomBytes(32).toString('base64url'),
            studentId: ids[1],
            enrollmentId: e.id,
            createdById: actor.id,
            snapshot: {
              type: 'DECLARACAO_VINCULO',
              mode: 'INTEGRADO',
              className: '1A DS',
              periodLabel: '2026',
              body: 'Texto da minuta fictícia ' + i,
            },
            sourcePdfSha256: 'a'.repeat(64),
            sourcePdfPage: 1,
          },
        }),
      );
    const request = await db.declarationRequest.create({
      data: { studentId: ids[1], enrollmentId: e.id },
    });
    await page.goto(base + '/secretaria/documentos');
    const submit = page.getByRole('button', {
      name: 'Buscar aluno',
      exact: true,
    });
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByLabel('Nome ou matrícula do aluno')).toBeFocused();
    await page.getByLabel('Nome ou matrícula do aluno').fill(tag);
    await page.route(
      '**/api/secretaria/documentos/busca',
      (route) => route.abort('failed'),
      { times: 1 },
    );
    await submit.click();
    await expect(
      page.getByRole('button', { name: 'Tentar novamente', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Tentar novamente', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Alunos encontrados: 1' }),
    ).toBeVisible();
    expect(page.url()).toBe(base + '/secretaria/documentos');
    await page
      .getByRole('button', { name: 'Ver documentos de Aluno sintético ' + tag })
      .click();
    const open = (index: number) =>
      page.getByRole('button', {
        name: 'Conferir minuta ' + docs[index].id.slice(-8),
      });
    await open(0).click();
    await expect(
      page.getByText('Texto da minuta fictícia 0', { exact: true }),
    ).toBeVisible();
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath('documentos-' + width + '.png'),
        fullPage: true,
      });
    }
    await page
      .getByRole('button', { name: 'Cancelar minuta', exact: true })
      .click();
    const modal = page.getByRole('dialog');
    await expect(
      modal.getByRole('button', { name: 'Voltar à conferência' }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Cancelar minuta', exact: true }),
    ).toBeFocused();
    await page
      .getByRole('button', { name: 'Cancelar minuta', exact: true })
      .click();
    await modal
      .getByLabel('Motivo', { exact: true })
      .fill('Correção conferida pela secretaria.');
    await modal.getByLabel('Conferi o aluno').check();
    // A escrita chega ao servidor, mas a resposta se perde. Repetir não cria outro evento.
    await page.route(
      '**/api/secretaria/documentos/alteracoes',
      async (route) => {
        await route.fetch();
        await route.abort('failed');
      },
      { times: 1 },
    );
    await modal.getByRole('button', { name: 'Confirmar cancelamento' }).click();
    await expect(modal.getByText(/A resposta não chegou/)).toBeVisible();
    await expect(
      modal.getByRole('button', { name: 'Fechar e consultar situação' }),
    ).toBeFocused();
    await expect(modal.getByLabel('Motivo', { exact: true })).toBeDisabled();
    await modal.getByRole('button', { name: 'Repetir o mesmo envio' }).click();
    await expect(modal).not.toBeVisible();
    await expect(
      page.getByText('Minuta cancelada. O pedido do aluno foi preservado.'),
    ).toBeVisible();
    expect(
      await db.declarationDocumentAction.count({
        where: { documentId: docs[0].id },
      }),
    ).toBe(1);
    await open(1).click();
    await expect(
      page.getByText('Texto da minuta fictícia 1', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Substituir minuta', exact: true })
      .click();
    await modal.getByLabel('Minuta corrigida').selectOption(docs[2].id);
    await modal
      .getByLabel('Motivo', { exact: true })
      .fill('Nova minuta com os dados corrigidos.');
    await modal.getByLabel('Conferi o aluno').check();
    await modal.getByRole('button', { name: 'Confirmar substituição' }).click();
    await expect(modal).not.toBeVisible();
    await expect(
      page.getByText(
        'Minuta substituída. O histórico original foi preservado.',
      ),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Ver minuta substituta', exact: true })
      .click();
    await expect(
      page.getByText('Texto da minuta fictícia 2', { exact: true }),
    ).toBeVisible();
    expect(
      (
        await db.declarationRequest.findUniqueOrThrow({
          where: { id: request.id },
        })
      ).status,
    ).toBe(request.status);
    expect(errors).toEqual([]);
  } finally {
    try {
      await db.declarationDocumentAction.deleteMany({
        where: { studentId: { in: ids } },
      });
      await db.declarationDocument.deleteMany({
        where: { studentId: { in: ids } },
      });
      await db.student.deleteMany({ where: { id: { in: ids } } });
    } finally {
      await env.close();
      if (previous === undefined)
        delete process.env.DECLARATION_REGISTRY_PREVIEW;
      else process.env.DECLARATION_REGISTRY_PREVIEW = previous;
    }
  }
});
