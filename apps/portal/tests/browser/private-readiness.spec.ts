import { test, expect } from '@playwright/test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { openTestEnvironment } from '../../scripts/test-environment';
import { syntheticEnrollmentValidity } from '../../scripts/enrollment-fixture';
import { schoolHeaderFixture } from '../../scripts/test-sheet-input';

for (const role of ['student', 'secretary'] as const) {
  test(`controles privados ${role} aguardam os scripts antes de receber cliques`, async ({
    page,
  }) => {
    const previous = process.env.DECLARATION_REGISTRY_PREVIEW;
    process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
    const environment = await openTestEnvironment({ http: true });
    const { db, base } = environment;
    let studentId: string | undefined;
    let release = () => {};
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST')
        posts.push(new URL(request.url()).pathname);
    });
    try {
      const person = await db.student.create({
        data: {
          fullName: 'Pessoa fictícia prontidão privada',
          birthDate: new Date('2000-01-01'),
          account: {
            create: {
              email: randomUUID() + '@example.invalid',
              passwordHash: 'fixture',
              status: 'active',
              role,
            },
          },
          ...(role === 'student'
            ? {
                details: {
                  create: {
                    parentOne: 'Filiação fictícia',
                    parentageSource: 'SCHOOL_RECORD',
                    birthCity: 'Recife',
                    birthState: 'PE',
                    birthCountry: 'BR',
                    birthplaceSource: 'SCHOOL_RECORD',
                  },
                },
                enrollments: {
                  create: {
                    mode: 'INTEGRADO',
                    courseLabel: 'DS',
                    className: '2A DS fictícia',
                    grade: 2,
                    ...syntheticEnrollmentValidity(),
                  },
                },
              }
            : {}),
        },
        include: { account: true },
      });
      studentId = person.id;
      const token = randomBytes(32).toString('base64url');
      await db.session.create({
        data: {
          accountId: person.account!.id,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + 600000),
        },
      });
      await page
        .context()
        .addCookies([{ name: 'ete_portal_session', value: token, url: base }]);
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/*', async (route) => {
        if (route.request().resourceType() === 'script') await gate;
        await route.continue();
      });
      const path =
        role === 'student' ? '/declaracao' : '/secretaria/importacao/integrado';
      await page.goto(base + path, { waitUntil: 'commit' });
      const action =
        role === 'student'
          ? page.getByRole('button', {
              name: /^(Gerar declaração|Carregando…)$/,
            })
          : page.locator('form button').first();
      await expect(action).toBeVisible();
      await expect(action).toBeDisabled();
      await expect(action).toHaveAttribute('aria-busy', 'true');
      if (role === 'secretary')
        await expect(
          page.getByLabel('Planilha de alunos do integrado'),
        ).toBeDisabled();
      expect(posts).toEqual([]);
      release();
      await expect(action).toBeEnabled();
      await expect(action).toHaveAttribute('aria-busy', 'false');
      await page.unrouteAll({ behavior: 'wait' });
      if (role === 'student') {
        await action.click();
        await expect(
          page.getByRole('dialog', { name: 'Onde você nasceu?' }),
        ).toBeVisible();
        expect(posts).toEqual([]);
      } else {
        const fixture = schoolHeaderFixture('INTEGRADO', 'ADM');
        await page.getByLabel('Planilha de alunos do integrado').setInputFiles({
          name: 'integrado-ficticio.xls',
          mimeType: 'application/vnd.ms-excel',
          buffer: fixture.file(),
        });
        const response = page.waitForResponse(
          (r) => new URL(r.url()).pathname === '/api/secretaria/importacao',
        );
        await action.click();
        expect((await response).status()).toBe(200);
        await expect(page.getByLabel('Nome da turma')).toHaveValue('ADM1IN-A');
      }
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
      try {
        if (studentId) await db.student.delete({ where: { id: studentId } });
      } finally {
        await environment.close();
        if (previous === undefined)
          delete process.env.DECLARATION_REGISTRY_PREVIEW;
        else process.env.DECLARATION_REGISTRY_PREVIEW = previous;
      }
    }
  });
}
