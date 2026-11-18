import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { changeAccountPassword } from '../src/lib/account-password-change';
import { AccountChangeError } from '../src/lib/account-change-auth';
import { getDb } from '../src/lib/db';
import { hashPassword, verifyPassword } from '../src/lib/password';
import { openTestEnvironment, reportTestFailure } from './test-environment';

const oldPassword = 'SenhaFicticiaAntiga#24';
const nextPassword = 'SenhaFicticiaNova#24';
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const credential = () => digest(randomBytes(32).toString('base64url'));

async function main() {
  const env = await openTestEnvironment();
  const { db } = env;
  const runtime = getDb();
  try {
    const oldHash = await hashPassword(oldPassword);
    const account = await db.account.create({
      data: {
        email: 'conta-ficticia@example.invalid',
        passwordHash: oldHash,
        status: 'active',
        student: {
          create: {
            fullName: 'Pessoa fictícia alterando senha',
            birthDate: new Date('2000-01-01'),
          },
        },
      },
    });
    const expiresAt = new Date(Date.now() + 600_000);
    const first = credential();
    const second = credential();
    await db.session.createMany({
      data: [first, second].map((tokenHash) => ({
        accountId: account.id,
        tokenHash,
        expiresAt,
      })),
    });
    await db.passwordResetToken.create({
      data: {
        accountId: account.id,
        tokenHash: credential(),
        credentialHash: credential(),
        expiresAt,
      },
    });
    const fields = {
      currentPassword: oldPassword,
      newPassword: nextPassword,
      confirmPassword: nextPassword,
    };
    await assert.rejects(
      changeAccountPassword(runtime, first, {
        ...fields,
        currentPassword: 'SenhaFicticiaErrada',
      }),
      (error: unknown) =>
        error instanceof AccountChangeError && error.reason === 'password',
    );
    await assert.rejects(
      changeAccountPassword(runtime, credential(), fields),
      (error: unknown) =>
        error instanceof AccountChangeError && error.reason === 'session',
    );
    assert.equal(
      await db.session.count({ where: { accountId: account.id } }),
      2,
    );
    assert.equal(await db.accountSecurityEvent.count(), 0);

    await db.$executeRaw`ALTER TABLE account_security_events ADD CONSTRAINT fixture_reject_event CHECK (false) NOT VALID`;
    await assert.rejects(changeAccountPassword(runtime, first, fields));
    await db.$executeRaw`ALTER TABLE account_security_events DROP CONSTRAINT fixture_reject_event`;
    assert.equal(
      (await db.account.findUniqueOrThrow({ where: { id: account.id } }))
        .passwordHash,
      oldHash,
    );
    assert.equal(
      await db.session.count({ where: { accountId: account.id } }),
      2,
    );
    assert.equal(
      await db.passwordResetToken.count({ where: { accountId: account.id } }),
      1,
    );

    const results = await Promise.allSettled([
      changeAccountPassword(runtime, first, fields),
      changeAccountPassword(runtime, second, fields),
    ]);
    assert.equal(
      results.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      results.filter((result) => result.status === 'rejected').length,
      1,
    );
    const updated = await db.account.findUniqueOrThrow({
      where: { id: account.id },
    });
    assert.ok(updated.passwordHash);
    assert.equal(
      await verifyPassword(nextPassword, updated.passwordHash),
      true,
    );
    assert.equal(
      await verifyPassword(oldPassword, updated.passwordHash),
      false,
    );
    assert.equal(
      await db.session.count({ where: { accountId: account.id } }),
      0,
    );
    assert.equal(
      await db.passwordResetToken.count({ where: { accountId: account.id } }),
      0,
    );
    const [event, ...extra] = await db.accountSecurityEvent.findMany();
    assert.equal(extra.length, 0);
    assert.equal(event?.action, 'PASSWORD_CHANGED');
    assert.equal(event?.accountId, account.id);
    assert.doesNotMatch(
      JSON.stringify(event),
      /@example|SenhaFicticia|passwordHash|tokenHash/,
    );
    await assert.rejects(
      db.accountSecurityEvent.delete({ where: { id: event.id } }),
    );
    console.log(
      'OK: senha atual e sessão conferidas, concorrência, revogação, trilha protegida e rollback atômico.',
    );
  } finally {
    await env.close();
  }
}
main().catch(reportTestFailure);
