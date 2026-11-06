import { test, expect } from '@playwright/test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { openTestEnvironment } from '../../scripts/test-environment';
import { syntheticEnrollmentValidity } from '../../scripts/enrollment-fixture';
import { issueTestDeclaration } from '../../src/lib/declaration-issuance';

test('secretaria consulta minutas e registra cancelamento/substituição com recuperação de rede', async ({
  page,
}) => {
  const previousOrigin = process.env.PORTAL_PUBLIC_URL;
  process.env.PORTAL_PUBLIC_URL = 'https://portal.example.invalid';
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
    await page.goto(base + '/secretaria/declaracoes');
    await expect(
      page.getByRole('heading', {
        name: 'Declarações dos alunos',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: /Preparar declaração|Liberar retirada/,
      }),
    ).toHaveCount(0);
    const submit = page.getByRole('button', {
      name: 'Buscar declarações',
      exact: true,
    });
    await expect(submit).toBeEnabled();
    await submit.click();
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
    expect(page.url()).toBe(base + '/secretaria/declaracoes');
    await page
      .getByRole('button', { name: 'Ver documentos de Aluno sintético ' + tag })
      .click();
    const open = (index: number) =>
      page.getByRole('button', {
        name: 'Ver declaração ' + docs[index].id.slice(-8),
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
      .getByRole('button', { name: 'Cancelar documento', exact: true })
      .click();
    const modal = page.getByRole('dialog');
    await expect(
      modal.getByRole('button', { name: 'Voltar à conferência' }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Cancelar documento', exact: true }),
    ).toBeFocused();
    await page
      .getByRole('button', { name: 'Cancelar documento', exact: true })
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
      page.getByText('Documento cancelado. O pedido do aluno foi preservado.'),
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
      .getByRole('button', { name: 'Substituir documento', exact: true })
      .click();
    await modal.getByLabel('Documento substituto').selectOption(docs[2].id);
    await modal
      .getByLabel('Motivo', { exact: true })
      .fill('Nova minuta com os dados corrigidos.');
    await modal.getByLabel('Conferi o aluno').check();
    await modal.getByRole('button', { name: 'Confirmar substituição' }).click();
    await expect(modal).not.toBeVisible();
    await expect(
      page.getByText(
        'Documento substituído. O histórico original foi preservado.',
      ),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Ver documento substituto', exact: true })
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
    const studentAccount = await db.account.create({
      data: {
        studentId: ids[1],
        email: randomUUID() + '@example.invalid',
        passwordHash: 'ficticio',
        status: 'active',
        role: 'student',
      },
    });
    await db.studentDetails.create({
      data: {
        studentId: ids[1],
        parentOne: 'Filiação fictícia',
        parentageSource: 'SCHOOL_RECORD',
        birthCity: 'Recife',
        birthState: 'PE',
        birthCountry: 'BR',
        birthplaceSource: 'SCHOOL_RECORD',
      },
    });
    const issued = await issueTestDeclaration(studentAccount.id, {
      enrollmentId: e.id,
      requestKey: randomUUID(),
    });
    await page.reload();
    await page.getByLabel('Nome ou matrícula do aluno').fill(tag);
    await page
      .getByRole('button', { name: 'Buscar declarações', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Ver documentos de Aluno sintético ' + tag })
      .click();
    await page
      .getByRole('button', {
        name: 'Ver declaração ' + issued.document.id.slice(-8),
        exact: true,
      })
      .click();
    await expect(
      page
        .getByRole('region', { name: 'Detalhes da declaração', exact: true })
        .locator('p')
        .first()
        .getByText('Emitida para teste', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Substituir documento', exact: true }),
    ).toHaveCount(0);
    const archiveDownload = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Baixar PDF original', exact: true })
      .click();
    const archiveFile = await archiveDownload;
    const archived = await db.declarationDocument.findUniqueOrThrow({
      where: { id: issued.document.id },
      include: { archive: true },
    });
    const downloadedBytes = await import('node:fs/promises').then(
      async ({ readFile }) => readFile((await archiveFile.path())!),
    );
    expect(downloadedBytes).toEqual(Buffer.from(archived.archive!.bytes));
    expect(
      await db.declarationDocument.count({
        where: { studentId: ids[1], status: 'ISSUED' },
      }),
    ).toBe(1);
    await expect(
      page.getByRole('link', { name: 'Verificar declaração', exact: true }),
    ).toHaveAttribute('href', '/validar/' + issued.document.publicCode);
    await page.screenshot({
      path: test.info().outputPath('emissao-teste-1440.png'),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Cancelar documento', exact: true })
      .click();
    await modal
      .getByLabel('Motivo', { exact: true })
      .fill('Cancelamento da emissão de teste.');
    await modal.getByLabel('Conferi o aluno').check();
    await modal.getByRole('button', { name: 'Confirmar cancelamento' }).click();
    await expect(modal).not.toBeVisible();
    expect(
      (
        await db.declarationDocumentAction.findUniqueOrThrow({
          where: { documentId: issued.document.id },
        })
      ).action,
    ).toBe('CANCELLED');
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
    } finally {
      await env.close();
      if (previousOrigin === undefined) delete process.env.PORTAL_PUBLIC_URL;
      else process.env.PORTAL_PUBLIC_URL = previousOrigin;
      if (previous === undefined)
        delete process.env.DECLARATION_REGISTRY_PREVIEW;
      else process.env.DECLARATION_REGISTRY_PREVIEW = previous;
    }
  }
});
