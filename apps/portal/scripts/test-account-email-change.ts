import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { AccountChangeError } from '../src/lib/account-change-auth';
import {
  confirmAccountEmailChange,
  requestAccountEmailChange,
} from '../src/lib/account-email-change';
import { getDb } from '../src/lib/db';
import { hashPassword } from '../src/lib/password';
import { createVerifiedSession } from '../src/lib/session-record';

const password = 'ContaFicticiaEmail#2026';
const origin = 'https://portal.example.invalid';
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const digest = () => hash(randomBytes(32).toString('base64url'));
function linkToken(link: string) {
  const location = new URL(link);
  assert.equal(location.origin, origin);
  assert.equal(location.pathname, '/confirmar-novo-email');
  assert.equal(location.search, '');
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  assert.ok(token);
  return token;
}
const rejectedLink = (error: unknown) =>
  error instanceof AccountChangeError && error.reason === 'link';

async function main() {
  const env = await openTestEnvironment();
  const { db } = env;
  const runtime = getDb();
  try {
    const passwordHash = await hashPassword(password);
    async function person(email: string) {
      const account = await db.account.create({
        data: {
          status: 'active',
          email,
          passwordHash,
          student: {
            create: {
              fullName: 'Pessoa fictícia',
              birthDate: new Date('2000-01-01'),
            },
          },
        },
      });
      return { account, session: await session(account.id) };
    }
    async function session(accountId: string) {
      const tokenHash = digest();
      await db.session.create({
        data: {
          accountId,
          tokenHash,
          expiresAt: new Date(Date.now() + 600_000),
        },
      });
      return tokenHash;
    }
    const oldEmail = 'origem@example.invalid';
    const newEmail = 'novo@example.invalid';
    const personA = await person(oldEmail);
    const personB = await person('outra@example.invalid');
    const initial = {
      currentPassword: password,
      newEmail: 'NOVO@example.invalid',
    };
    assert.equal(
      await requestAccountEmailChange(
        runtime,
        personA.session,
        { ...initial, newEmail: 'OUTRA@example.invalid' },
        origin,
      ),
      null,
    );
    await assert.rejects(
      requestAccountEmailChange(
        runtime,
        personA.session,
        { ...initial, currentPassword: 'SenhaDiferente#24' },
        origin,
      ),
      (error: unknown) =>
        error instanceof AccountChangeError && error.reason === 'password',
    );
    assert.equal(await db.accountEmailChange.count(), 0);
    const pending = await requestAccountEmailChange(
      runtime,
      personA.session,
      initial,
      origin,
    );
    assert.ok(pending);
    assert.equal(pending.email, newEmail);
    const first = linkToken(pending.confirmationLink);
    const stored = await db.accountEmailChange.findUniqueOrThrow({
      where: { accountId: personA.account.id },
    });
    assert.equal(stored.tokenHash, hash(first));
    assert.notEqual(stored.tokenHash, first);
    assert.equal(
      (
        await db.account.findUniqueOrThrow({
          where: { id: personA.account.id },
        })
      ).email,
      oldEmail,
    );
    await assert.rejects(
      confirmAccountEmailChange(runtime, personB.session, first),
      rejectedLink,
    );
    await db.accountEmailChange.update({
      where: { accountId: personA.account.id },
      data: {
        createdAt: new Date('2020-01-01'),
        expiresAt: new Date('2020-01-02'),
      },
    });
    await assert.rejects(
      confirmAccountEmailChange(runtime, personA.session, first),
      rejectedLink,
    );

    const renewed = await requestAccountEmailChange(
      runtime,
      personA.session,
      initial,
      origin,
    );
    assert.ok(renewed);
    const token = linkToken(renewed.confirmationLink);
    assert.notEqual(token, first);
    const anotherSession = await session(personA.account.id);
    const results = await Promise.allSettled([
      confirmAccountEmailChange(runtime, personA.session, token),
      confirmAccountEmailChange(runtime, anotherSession, token),
    ]);
    const wins = results.filter((result) => result.status === 'fulfilled');
    assert.deepEqual(wins, [
      { status: 'fulfilled', value: { previousEmail: oldEmail, newEmail } },
    ]);
    assert.equal(
      (
        await db.account.findUniqueOrThrow({
          where: { id: personA.account.id },
        })
      ).email,
      newEmail,
    );
    assert.equal(await db.accountEmailChange.count(), 0);
    assert.equal(
      await db.session.count({ where: { accountId: personA.account.id } }),
      0,
    );
    assert.equal(
      await createVerifiedSession(
        runtime,
        personA.account.id,
        passwordHash,
        oldEmail,
        digest(),
        new Date(Date.now() + 60_000),
      ),
      false,
      'O login iniciado antes da mudança não pode criar sessão com o e-mail anterior.',
    );
    const [event] = await db.accountSecurityEvent.findMany();
    assert.equal(event.action, 'EMAIL_CHANGED');
    assert.doesNotMatch(JSON.stringify(event), /@example|token|hash/i);
    await assert.rejects(
      confirmAccountEmailChange(
        runtime,
        await session(personA.account.id),
        token,
      ),
      rejectedLink,
    );

    const sharedEmail = 'mesmo@example.invalid';
    const sessionA = await session(personA.account.id);
    const claimA = await requestAccountEmailChange(
      runtime,
      sessionA,
      { currentPassword: password, newEmail: sharedEmail },
      origin,
    );
    const claimB = await requestAccountEmailChange(
      runtime,
      personB.session,
      { currentPassword: password, newEmail: sharedEmail },
      origin,
    );
    assert.ok(claimA && claimB);
    const concurrent = await Promise.allSettled([
      confirmAccountEmailChange(
        runtime,
        sessionA,
        linkToken(claimA.confirmationLink),
      ),
      confirmAccountEmailChange(
        runtime,
        personB.session,
        linkToken(claimB.confirmationLink),
      ),
    ]);
    assert.equal(
      concurrent.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(await db.account.count({ where: { email: sharedEmail } }), 1);
    assert.equal(await db.accountSecurityEvent.count(), 2);
    console.log(
      'OK: contato só muda após confirmação, link restrito/usado uma vez, expiração, revogação, concorrência e auditoria sem endereços.',
    );
  } finally {
    await env.close();
  }
}
main().catch(reportTestFailure);
