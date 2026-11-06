import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { syntheticEnrollmentValidity } from './enrollment-fixture';

async function main() {
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const ids: string[] = [];
  try {
    // Um aluno com vínculos nas duas modalidades: o pedido, não o primeiro vínculo, define o filtro.
    const person = await db.student.create({
      data: {
        fullName: 'Estudante fictício das modalidades',
        birthDate: new Date('2000-01-01'),
      },
    });
    ids.push(person.id);
    const staff = await db.student.create({
      data: {
        fullName: 'Secretaria fictícia das modalidades',
        birthDate: new Date('1990-01-01'),
      },
    });
    ids.push(staff.id);
    const cookies: Record<string, string> = {};
    for (const role of ['secretary', 'student'] as const) {
      const account = await db.account.create({
        data: {
          studentId: role === 'student' ? person.id : staff.id,
          role,
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
      cookies[role] = 'ete_portal_session=' + token;
    }
    for (const mode of ['INTEGRADO', 'SUBSEQUENTE'] as const) {
      const count = mode === 'INTEGRADO' ? 21 : 2;
      for (let i = 0; i < count; i++) {
        const enrollment = await db.enrollment.create({
          data: {
            studentId: person.id,
            mode,
            className: mode + ' fictício ' + i,
            courseLabel: 'DS',
            grade: mode === 'INTEGRADO' ? 2 : null,
            moduleNumber: mode === 'SUBSEQUENTE' ? 1 : null,
            ...syntheticEnrollmentValidity(),
          },
        });
        await db.declarationRequest.create({
          data: {
            studentId: person.id,
            enrollmentId: enrollment.id,
            status:
              mode === 'SUBSEQUENTE' && i === 1
                ? 'IN_PREPARATION'
                : 'REQUESTED',
            generatedAt: mode === 'SUBSEQUENTE' && i === 1 ? new Date() : null,
          },
        });
      }
    }
    const get = (query: string, cookie = cookies.secretary) =>
      fetch(base + '/api/secretaria/solicitacoes?' + query, {
        headers: { Cookie: cookie },
      });
    const legacyPage = await fetch(base + '/secretaria/declaracoes', {
      headers: { Cookie: cookies.secretary },
    });
    assert.equal(
      legacyPage.status,
      404,
      'Sem a chave de revisão não deve reaparecer a tela antiga de preparar/retirada.',
    );
    for (const mode of ['admin', 'integrado', 'INTEGRADO,SUBSEQUENTE', '']) {
      assert.equal(
        (await get('mode=' + encodeURIComponent(mode))).status,
        400,
        'Modalidade inválida deve ser recusada.',
      );
    }
    assert.equal((await get('mode=INTEGRADO', '')).status, 401);
    assert.equal((await get('mode=SUBSEQUENTE', cookies.student)).status, 403);
    const check = async (
      query: string,
      total: number,
      size: number,
      mode?: string,
      page = 1,
    ) => {
      const response = await get(query);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control') ?? '', /no-store/);
      const body = await response.json();
      assert.equal(body.total, total);
      assert.equal(body.page, page);
      assert.equal(body.requests.length, size);
      if (mode)
        for (const row of body.requests) {
          const enrollment = row.student.enrollments.find(
            (item: { id: string }) => item.id === row.enrollmentId,
          );
          assert.equal(enrollment?.mode, mode);
        }
      return body;
    };
    const first = await check('mode=INTEGRADO', 21, 20, 'INTEGRADO');
    const last = await check('mode=INTEGRADO&page=2', 21, 1, 'INTEGRADO', 2);
    assert.ok(
      first.requests.every(
        (row: { id: string }) => row.id !== last.requests[0].id,
      ),
    );
    await check('mode=SUBSEQUENTE&page=2', 2, 2, 'SUBSEQUENTE');
    await check('mode=SUBSEQUENTE&status=REQUESTED', 1, 1, 'SUBSEQUENTE');
    await check('mode=SUBSEQUENTE&status=IN_PREPARATION', 1, 1, 'SUBSEQUENTE');
    await check(
      'mode=INTEGRADO&status=IN_PREPARATION&page=999',
      0,
      0,
      'INTEGRADO',
    );
    await check(
      'mode=SUBSEQUENTE&status=READY_FOR_PICKUP',
      0,
      0,
      'SUBSEQUENTE',
    );
    await check('', 23, 20);
    await check('mode=ALL', 23, 20);
    console.log(
      'Modalidades: paginação, contagem, situação, vínculo exato, autenticação, autorização e entradas inválidas aprovados.',
    );
  } finally {
    try {
      await db.student.deleteMany({ where: { id: { in: ids } } });
    } finally {
      await environment.close();
    }
  }
}
main().catch(reportTestFailure);
