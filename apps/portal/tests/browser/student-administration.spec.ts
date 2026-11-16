import { test, expect } from '@playwright/test';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { openTestEnvironment } from '../../scripts/test-environment';
import { syntheticEnrollmentValidity } from '../../scripts/enrollment-fixture';
import { subsequentFixture } from '../../scripts/subsequent-declaration-fixture';
import { issueTestDeclaration } from '../../src/lib/declaration-issuance';

for (const mode of ['INTEGRADO', 'SUBSEQUENTE'] as const) {
  test(`secretaria administra aluno ${mode} sem cancelar documentos e recupera envio incerto`, async ({
    page,
  }, info) => {
    const previousEnvironment = {
      DECLARATION_REGISTRY_PREVIEW: process.env.DECLARATION_REGISTRY_PREVIEW,
      PORTAL_PUBLIC_URL: process.env.PORTAL_PUBLIC_URL,
    };
    process.env.DECLARATION_REGISTRY_PREVIEW = 'true';
    process.env.PORTAL_PUBLIC_URL = 'https://portal.example.invalid';
    const env = await openTestEnvironment({ http: true });
    const ids: string[] = [];
    let offeringId: string | undefined;
    const errors: string[] = [];
    const navigation: { time: number; event: string; detail: string }[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame())
        navigation.push({
          time: Date.now(),
          event: 'navigation',
          detail: frame.url(),
        });
    });
    page.on('console', (msg) => {
      if (/Fast Refresh|\[HMR\]/.test(msg.text()))
        navigation.push({
          time: Date.now(),
          event: 'development',
          detail: msg.text(),
        });
    });
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      async function person(role: 'student' | 'secretary') {
        const s = await env.db.student.create({
          data: {
            fullName: 'Pessoa fictícia ' + role + ' ' + mode,
            birthDate: new Date('2000-01-01'),
            schoolRegistration: randomBytes(6).toString('hex'),
            details:
              role === 'student'
                ? {
                    create: {
                      parentOne: 'Filiação fictícia',
                      parentageSource: 'SCHOOL_RECORD',
                      birthCity: 'Recife',
                      birthState: 'PE',
                      birthCountry: 'BR',
                      birthplaceSource: 'SCHOOL_RECORD',
                    },
                  }
                : undefined,
          },
        });
        ids.push(s.id);
        const a = await env.db.account.create({
          data: {
            studentId: s.id,
            role,
            status: 'active',
            email: randomUUID() + '@example.invalid',
            passwordHash: 'ficticio',
          },
        });
        const token = randomBytes(32).toString('base64url');
        await env.db.session.create({
          data: {
            accountId: a.id,
            tokenHash: createHash('sha256').update(token).digest('hex'),
            expiresAt: new Date(Date.now() + 600000),
          },
        });
        return { s, a, token };
      }
      const staff = await person('secretary'),
        student = await person('student');
      let enrollmentId: string;
      if (mode === 'INTEGRADO')
        enrollmentId = (
          await env.db.enrollment.create({
            data: {
              studentId: student.s.id,
              mode,
              className: '2A DS fictícia',
              grade: 2,
              courseLabel: 'DS',
              ...syntheticEnrollmentValidity(),
            },
          })
        ).id;
      else {
        const f = subsequentFixture('DS', 2);
        offeringId = f.enrollment.offeringId;
        await env.db.courseOffering.create({
          data: {
            id: offeringId,
            label: f.schedule.label,
            courseLabel: 'DS',
            calendars: {
              create: {
                revision: 1,
                schedule: f.schedule,
                createdById: staff.a.id,
              },
            },
          },
        });
        const { offering: ignored, ...fields } = f.enrollment;
        void ignored;
        enrollmentId = (
          await env.db.enrollment.create({
            data: { ...fields, studentId: student.s.id },
          })
        ).id;
      }
      const issued = await issueTestDeclaration(student.a.id, {
        enrollmentId,
        requestKey: randomUUID(),
      });
      await page
        .context()
        .addCookies([
          { name: 'ete_portal_session', value: staff.token, url: env.base },
        ]);
      // Compila as duas páginas e a recusa de papel antes de manter estado na tela da secretaria.
      // O servidor de desenvolvimento pode recarregar páginas ao gerar a fronteira not-found.
      const warm = await page.context().browser()!.newContext();
      try {
        await warm.addCookies([
          { name: 'ete_portal_session', value: student.token, url: env.base },
        ]);
        const check = await warm.newPage();
        await check.goto(env.base + '/secretaria/alunos');
        await expect(
          check.getByRole('heading', { name: 'Alunos e acesso', exact: true }),
        ).toHaveCount(0);
        await check.goto(env.base + '/declaracao');
        await expect(
          check.getByRole('button', { name: 'Gerar declaração', exact: true }),
        ).toBeVisible();
      } finally {
        await warm.close();
      }
      await page.goto(env.base + '/secretaria/alunos');
      await expect(
        page.getByRole('heading', { name: 'Alunos e acesso', exact: true }),
      ).toBeVisible();
      await page
        .getByLabel('Nome ou matrícula do aluno')
        .fill(student.s.schoolRegistration!);
      await page
        .getByRole('combobox', { name: 'Modalidade', exact: true })
        .selectOption(mode);
      await page
        .getByRole('button', { name: 'Buscar alunos', exact: true })
        .click();
      const result = page.getByRole('region', {
        name: 'Resultado da busca de alunos',
      });
      await expect(
        result.getByText(student.s.fullName!, { exact: true }),
      ).toBeVisible();
      await result
        .getByRole('button', { name: 'Ver aluno e bloqueios' })
        .click();
      const detail = page.getByRole('dialog', {
        name: 'Dados e bloqueios do aluno',
      });
      const block = detail.getByRole('button', {
        name: 'Bloquear novas declarações',
        exact: true,
      });
      await expect(block).toBeVisible();
      await block.click();
      let dialog = page.getByRole('dialog', {
        name: 'Bloquear novas declarações',
        exact: true,
      });
      await expect(
        dialog.getByRole('button', { name: 'Voltar', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(block).toBeFocused();
      await block.click();
      await dialog
        .getByRole('button', { name: 'Confirmar alteração', exact: true })
        .click();
      await expect(dialog.getByRole('alert')).toContainText('Motivo');
      await dialog
        .getByRole('textbox', { name: 'Motivo', exact: true })
        .fill('Conferência fictícia de emissão');
      await dialog.getByLabel('Conferi o aluno').check();
      await page.route(
        '**/api/secretaria/alunos/administracao',
        async (route) => {
          if (route.request().postDataJSON().operation === 'change')
            await route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: JSON.stringify({ error: 'Confira o motivo informado.' }),
            });
          else await route.continue();
        },
      );
      await dialog
        .getByRole('button', { name: 'Confirmar alteração', exact: true })
        .click();
      await expect(dialog.getByRole('alert')).toContainText('Confira o motivo');
      await expect(
        dialog.getByRole('textbox', { name: 'Motivo', exact: true }),
      ).toBeEditable();
      await page.unroute('**/api/secretaria/alunos/administracao');
      await dialog
        .getByRole('textbox', { name: 'Motivo', exact: true })
        .fill('Conferência fictícia de emissão\nDados conferidos');
      let lost = false;
      await page.route(
        '**/api/secretaria/alunos/administracao',
        async (route) => {
          const b = route.request().postDataJSON();
          if (b.operation === 'change' && !lost) {
            lost = true;
            await route.fetch();
            await route.abort();
          } else await route.continue();
        },
      );
      await dialog
        .getByRole('button', { name: 'Confirmar alteração', exact: true })
        .click();
      await expect(dialog.getByRole('alert')).toContainText('mesmo envio');
      await expect(
        dialog.getByRole('textbox', { name: 'Motivo', exact: true }),
      ).toHaveValue('Conferência fictícia de emissão\nDados conferidos');
      await dialog
        .getByRole('button', { name: 'Repetir o mesmo envio' })
        .click();
      await expect(dialog).not.toBeVisible();
      await expect(
        detail.getByRole('button', {
          name: 'Desbloquear novas declarações',
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await env.db.studentAccessChange.count({
          where: { studentId: student.s.id },
        }),
      ).toBe(1);
      expect(
        await env.db.declarationDocumentAction.count({
          where: { documentId: issued.document.id },
        }),
      ).toBe(0);
      await detail
        .getByRole('button', { name: 'Bloquear acesso', exact: true })
        .click();
      dialog = page.getByRole('dialog', {
        name: 'Bloquear acesso ao portal',
        exact: true,
      });
      await dialog
        .getByRole('textbox', { name: 'Motivo', exact: true })
        .fill('Bloqueio fictício de acesso');
      await dialog.getByLabel('Conferi o aluno').check();
      await dialog
        .getByRole('button', { name: 'Confirmar alteração', exact: true })
        .click();
      await expect(
        detail.getByRole('button', { name: 'Desbloquear acesso', exact: true }),
      ).toBeVisible();
      expect(
        await env.db.session.count({ where: { accountId: student.a.id } }),
      ).toBe(0);
      await detail
        .getByRole('button', { name: 'Desbloquear acesso', exact: true })
        .click();
      dialog = page.getByRole('dialog', {
        name: 'Desbloquear acesso ao portal',
        exact: true,
      });
      await dialog
        .getByRole('textbox', { name: 'Motivo', exact: true })
        .fill('Acesso fictício conferido');
      await dialog.getByLabel('Conferi o aluno').check();
      await dialog
        .getByRole('button', { name: 'Confirmar alteração', exact: true })
        .click();
      await expect(
        detail.getByRole('button', { name: 'Bloquear acesso', exact: true }),
      ).toBeVisible();
      await detail
        .getByRole('button', { name: 'Bloquear acesso', exact: true })
        .click();
      dialog = page.getByRole('dialog', {
        name: 'Bloquear acesso ao portal',
        exact: true,
      });
      await dialog
        .getByRole('textbox', { name: 'Motivo', exact: true })
        .fill('Conferência fictícia desatualizada');
      await dialog.getByLabel('Conferi o aluno').check();
      await page.route(
        '**/api/secretaria/alunos/administracao',
        async (route) => {
          if (route.request().postDataJSON().operation === 'change')
            await route.fulfill({
              status: 409,
              contentType: 'application/json',
              body: JSON.stringify({
                error: 'Outra pessoa alterou este aluno.',
              }),
            });
          else await route.continue();
        },
      );
      await dialog
        .getByRole('button', { name: 'Confirmar alteração', exact: true })
        .click();
      await expect(dialog.getByRole('alert')).toContainText(
        'consulte a situação',
      );
      await expect(
        dialog.getByRole('button', {
          name: 'Confirmar alteração',
          exact: true,
        }),
      ).toBeDisabled();
      await dialog
        .getByRole('button', { name: 'Fechar e consultar situação' })
        .click();
      await page.unroute('**/api/secretaria/alunos/administracao');
      await expect(
        detail.getByRole('button', { name: 'Bloquear acesso', exact: true }),
      ).toBeVisible();
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        const buttons = await page
          .locator('main button')
          .evaluateAll((elements) =>
            elements
              .filter((e) => e.getClientRects().length > 0)
              .map((e) => ({
                height: e.getBoundingClientRect().height,
                display: getComputedStyle(e).display,
                canonical: e.classList.contains('ete-button'),
              })),
          );
        expect(buttons.length).toBeGreaterThan(5);
        expect(
          buttons.every(
            (b) =>
              b.height >= 44 &&
              ['flex', 'inline-flex'].includes(b.display) &&
              b.canonical,
          ),
        ).toBe(true);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`alunos-${mode}-${width}.png`),
          fullPage: true,
        });
      }
      const freshToken = randomBytes(32).toString('base64url');
      await env.db.session.create({
        data: {
          accountId: student.a.id,
          tokenHash: createHash('sha256').update(freshToken).digest('hex'),
          expiresAt: new Date(Date.now() + 600000),
        },
      });
      const studentPage = await page.context().browser()!.newContext();
      try {
        await studentPage.addCookies([
          { name: 'ete_portal_session', value: freshToken, url: env.base },
        ]);
        const p = await studentPage.newPage();
        await p.goto(env.base + '/declaracao');
        await expect(
          p.getByRole('button', { name: 'Gerar declaração', exact: true }),
        ).toBeDisabled();
        await expect(
          p.getByText('A emissão de novas declarações está bloqueada.', {
            exact: false,
          }),
        ).toBeVisible();
        const dl = p.waitForEvent('download');
        await p.getByRole('button', { name: 'Baixar', exact: true }).click();
        expect((await dl).suggestedFilename()).toContain('.pdf');
      } finally {
        await studentPage.close();
      }
      expect(errors).toEqual([]);
    } finally {
      await writeFile(
        info.outputPath('navigation-proof.json'),
        JSON.stringify({ navigation, errors }, null, 2),
      );
      await env.db.studentAccessChange.deleteMany({
        where: { studentId: { in: ids } },
      });
      await env.db.declarationCurrentIssue.deleteMany({
        where: { studentId: { in: ids } },
      });
      await env.db.declarationDocumentAction.deleteMany({
        where: { studentId: { in: ids } },
      });
      await env.db.declarationRequest.deleteMany({
        where: { studentId: { in: ids } },
      });
      await env.db.declarationDocument.deleteMany({
        where: { studentId: { in: ids } },
      });
      await env.db.declarationPdfArchive.deleteMany({
        where: { documents: { none: {} } },
      });
      await env.db.student.deleteMany({ where: { id: { in: ids } } });
      if (offeringId) {
        await env.db.courseCalendarVersion.deleteMany({
          where: { offeringId },
        });
        await env.db.courseOffering.delete({ where: { id: offeringId } });
      }
      try {
        await env.close();
      } finally {
        for (const [key, value] of Object.entries(previousEnvironment)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    }
  });
}
