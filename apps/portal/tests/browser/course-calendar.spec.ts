import { test, expect } from '@playwright/test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { openTestEnvironment } from '../../scripts/test-environment';

test('calendário manual saiu do menu, atalhos levam à importação e API antiga não altera referências', async ({
  page,
  context,
}) => {
  const env = await openTestEnvironment({ http: true });
  const { db, base } = env;
  let id: string | undefined;
  try {
    const staff = await db.student.create({
      data: {
        fullName: 'Secretaria sintética sem calendário manual',
        birthDate: new Date('1990-01-01'),
        account: {
          create: {
            email: randomUUID() + '@example.invalid',
            passwordHash: 'ficticio',
            role: 'secretary',
            status: 'active',
          },
        },
      },
      include: { account: true },
    });
    id = staff.id;
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        accountId: staff.account!.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    await context.addCookies([
      { name: 'ete_portal_session', value: token, url: base },
    ]);
    const before = await db.courseCalendarVersion.count();
    await page.goto(base + '/secretaria/calendarios');
    await expect(page).toHaveURL(base + '/secretaria/importacao/subsequente');
    await expect(
      page.getByRole('heading', {
        name: 'Importar alunos do subsequente',
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Abrir menu de serviços' }).click();
    await expect(
      page.getByRole('link', { name: 'Calendário do subsequente' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Cadastrar turma|Salvar calendário/ }),
    ).toHaveCount(0);
    for (const action of ['list', 'save', 'policy', 'members']) {
      const response = await context.request.post(
        base + '/api/secretaria/calendarios',
        {
          headers: { Origin: base },
          data: { action, offeringId: randomUUID(), confirmed: true },
        },
      );
      expect(response.status()).toBe(410);
      expect(response.headers()['cache-control']).toContain('no-store');
    }
    expect(await db.courseCalendarVersion.count()).toBe(before);
    await context.clearCookies();
    expect(
      (
        await context.request.post(base + '/api/secretaria/calendarios', {
          headers: { Origin: base },
          data: { action: 'save' },
        })
      ).status(),
    ).toBe(401);
  } finally {
    try {
      if (id) await db.student.deleteMany({ where: { id } });
    } finally {
      await env.close();
    }
  }
});
