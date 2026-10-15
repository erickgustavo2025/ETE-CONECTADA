import { syntheticEnrollmentValidity } from '../../scripts/enrollment-fixture';
import { randomBytes, randomInt } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { hashPassword } from '../../src/lib/password';

async function wrapFocus(page: Page, key: 'Tab' | 'Shift+Tab') {
  // O dialog nativo pode passar pelo interface do Chromium antes de voltar aos campos.
  for (let step = 0; step < 3; step++) {
    await page.keyboard.press(key);
    const neutral = await page.evaluate(
      () =>
        document.activeElement === document.body ||
        document.activeElement?.tagName === 'DIALOG',
    );
    if (!neutral) return;
  }
}

async function reflow(page: Page) {
  for (const field of await page
    .locator('input:not([type=hidden]), select, textarea')
    .all()) {
    if (await field.isVisible()) await expect(field).toHaveAccessibleName(/\S/);
  }
  for (const width of [320, 640, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    for (const dialog of await page.getByRole('dialog').all()) {
      if (await dialog.isVisible())
        expect(
          await dialog.evaluate(
            (element) => element.scrollWidth <= element.clientWidth + 1,
          ),
        ).toBe(true);
    }
  }
}

function contrast(a: number[], b: number[]) {
  function luminance(rgb: number[]) {
    const values = rgb.map((value) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  }
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('teclado, contraste e reflow preservam acesso, menu e declarações', async ({
  page,
}) => {
  const { openTestEnvironment } =
    await import('../../scripts/test-environment');
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const students: string[] = [];
  const suffix = randomBytes(8).toString('hex');
  const password = 'PortalSintetico#123';
  try {
    const student = await db.student.create({
      data: {
        fullName: 'Estudante sintético de acessibilidade',
        schoolRegistration: String(randomInt(10000000, 99999999)),
        birthDate: new Date('2008-01-15T00:00:00Z'),
        registrationAllowed: true,
        enrollments: {
          create: {
            mode: 'INTEGRADO',
            className: 'Turma sintética',
            ...syntheticEnrollmentValidity(),
            grade: 2,
            courseLabel: 'DS',
          },
        },
      },
    });
    students.push(student.id);
    await page.goto(`${base}/login`);
    await expect(
      page.getByRole('heading', { name: 'Acesso ao portal' }),
    ).toBeVisible();
    await reflow(page);
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('link', { name: 'Ir para o conteúdo' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    // O destino do atalho precisa receber foco, não apenas rolar a página.
    await expect(page.locator('main')).toBeFocused();
    await page.getByRole('button', { name: 'Entrar no portal' }).click();
    const identifier = page.getByLabel('CPF ou e-mail');
    await expect(identifier).toBeFocused();
    await expect(identifier).toHaveAttribute('aria-invalid', 'true');
    await expect(identifier).toHaveAttribute('aria-describedby', 'login-error');
    await expect(page.locator('#login-error')).toContainText('CPF ou e-mail');
    const input = page.getByLabel('Senha', { exact: true });
    const boundary = await input.evaluate((element) => {
      const s = getComputedStyle(element);
      const rgb = (v: string) =>
        v
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
      return { border: rgb(s.borderColor), background: rgb(s.backgroundColor) };
    });
    expect(
      contrast(boundary.border, boundary.background),
    ).toBeGreaterThanOrEqual(3);
    await identifier.press('Tab');
    await expect(input).toBeFocused();
    const colors = await input.evaluate((element) => {
      const style = getComputedStyle(element);
      const placeholder = getComputedStyle(element, '::placeholder');
      const rgb = (value: string) =>
        value
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
      return {
        outline: rgb(style.outlineColor),
        background: rgb(style.backgroundColor),
        placeholder: rgb(placeholder.color),
        border: rgb(style.borderColor),
      };
    });
    expect(contrast(colors.outline, colors.background)).toBeGreaterThanOrEqual(
      3,
    );
    expect(
      contrast(colors.placeholder, colors.background),
    ).toBeGreaterThanOrEqual(4.5);

    await page.goto(`${base}/cadastro`);
    await expect(
      page.getByRole('heading', { name: 'Primeiro acesso' }),
    ).toBeVisible();
    await reflow(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.getByLabel('Matrícula').fill(student.schoolRegistration!);
    await page.getByLabel('Data de nascimento').fill('2008-01-15');
    const trigger = page.getByRole('button', { name: /Conferir cadastro/ });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel('CPF', { exact: true })).toBeFocused();
    await dialog.getByRole('button', { name: 'Fechar', exact: true }).focus();
    await wrapFocus(page, 'Tab');
    await expect(page.getByLabel('CPF', { exact: true })).toBeFocused();
    await wrapFocus(page, 'Shift+Tab');
    await expect(
      dialog.getByRole('button', { name: 'Fechar', exact: true }),
    ).toBeFocused();
    await reflow(page);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();

    for (const role of ['student', 'secretary'] as const) {
      const identity =
        role === 'student'
          ? student
          : await db.student.create({
              data: {
                fullName: 'Secretaria sintética de acessibilidade',
                birthDate: new Date('1990-01-01T00:00:00Z'),
              },
            });
      if (role === 'secretary') students.push(identity.id);
      const email = `${role}-accessibility-${suffix}@eteconectada.invalid`;
      await db.account.create({
        data: {
          studentId: identity.id,
          role,
          status: 'active',
          email,
          passwordHash: await hashPassword(password),
        },
      });
      await page.goto(`${base}/login`);
      await page.getByLabel('CPF ou e-mail').fill(email);
      await page.getByLabel('Senha', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Entrar no portal' }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(
        page.getByRole('button', { name: 'Abrir menu de serviços' }),
      ).toBeVisible();
      await reflow(page);
      const menu = page.getByRole('button', { name: 'Abrir menu de serviços' });
      await expect(menu).toBeEnabled();
      await menu.focus();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('button', { name: 'Fechar menu' }),
      ).toBeFocused();
      await reflow(page);
      await page.setViewportSize({ width: 320, height: 640 });
      await page.getByRole('button', { name: 'Sair', exact: true }).focus();
      await wrapFocus(page, 'Tab');
      await expect(
        page.getByRole('button', { name: 'Fechar menu' }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
      await menu.press('Enter');
      await page.getByRole('link', { name: 'Declaração de vínculo' }).click();
      await expect(page).toHaveURL(
        role === 'student' ? /\/declaracao$/ : /\/secretaria\/declaracoes$/,
      );
      await expect(
        page.getByRole('heading', {
          name:
            role === 'student'
              ? 'Declaração de vínculo'
              : 'Declarações de vínculo',
          exact: true,
        }),
      ).toBeVisible();
      await reflow(page);
      if (role === 'student') {
        await expect(page.getByText('Nenhuma solicitação ainda')).toBeVisible();
        let finish: () => void = () => {};
        const gate = new Promise<void>((resolve) => {
          finish = resolve;
        });
        await page.route('**/api/declaracao/solicitacoes', async (route) => {
          await gate;
          await route.fulfill({
            status: 503,
            json: { error: 'Falha sintética; tente novamente.' },
          });
        });
        await page
          .getByRole('button', { name: 'Solicitar declaração', exact: true })
          .click();
        const submit = page.getByRole('button', {
          name: 'Enviando solicitação…',
        });
        try {
          await expect(submit).toBeDisabled();
          await expect(submit).toHaveAttribute('aria-busy', 'true');
        } finally {
          finish();
        }
        await expect(
          page.getByRole('alert').filter({ hasText: 'Falha sintética' }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', {
            name: 'Solicitar declaração',
            exact: true,
          }),
        ).toBeEnabled();
        await page.unroute('**/api/declaracao/solicitacoes');
      }
      await page.goto(`${base}/`);
      await expect(
        page.getByRole('button', { name: 'Abrir menu de serviços' }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Abrir menu de serviços' })
        .click();
      await page.getByRole('button', { name: 'Sair', exact: true }).click();
      await expect(page).toHaveURL(/\/login$/);
    }
  } finally {
    try {
      if (students.length)
        await db.student.deleteMany({ where: { id: { in: students } } });
    } finally {
      await environment.close();
    }
  }
});
