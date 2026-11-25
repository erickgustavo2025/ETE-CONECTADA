import { syntheticEnrollmentValidity } from './enrollment-fixture';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { hashPassword } from '../src/lib/password';
import { openTestEnvironment, reportTestFailure } from './test-environment';

async function main() {
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const created: string[] = [];
  const suffix = randomBytes(8).toString('hex');
  const password = randomBytes(24).toString('base64url');
  const passwordHash = await hashPassword(password);
  const request = (path: string, cookie?: string, body?: unknown) =>
    fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: base,
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'manual',
    });
  async function fixture(name: string, role: 'student' | 'secretary') {
    const student = await db.student.create({
      data: {
        fullName: `${name} fictício ${suffix}`,
        birthDate: new Date('2008-01-15T00:00:00Z'),
        details: {
          create: {
            birthCity: 'Recife',
            birthState: 'PE',
            birthCountry: 'BR',
            birthplaceSource: 'SCHOOL_RECORD',
            parentOne: 'Responsável sintético Um',
            parentTwo: 'Responsável sintético Dois',
            parentageSource: 'SCHOOL_RECORD',
          },
        },
        schoolRegistration: String(randomInt(10000000, 99999999)),
        enrollments: {
          create: {
            mode: 'INTEGRADO',
            ...syntheticEnrollmentValidity(),
            className: `Teste ${suffix}`,
            grade: 2,
            courseLabel: 'Curso fictício',
          },
        },
      },
      include: { enrollments: true },
    });
    created.push(student.id);
    const account = await db.account.create({
      data: {
        studentId: student.id,
        role,
        status: 'active',
        passwordHash,
        email: `sessao-${student.id}@eteconectada.invalid`,
      },
    });
    return { student, account };
  }
  async function login(email: string) {
    const response = await request('/api/login', undefined, {
      identifier: email,
      password,
    });
    assert.equal(
      response.status,
      200,
      'Login sintético deve funcionar antes dos casos negativos.',
    );
    const header = response.headers.get('set-cookie')!;
    assert.match(header, /HttpOnly/i);
    assert.match(header, /SameSite=lax/i);
    assert.match(header, /Path=\//i);
    assert.match(response.headers.get('cache-control')!, /no-store/);
    const cookie = header.split(';')[0];
    const token = cookie.slice('ete_portal_session='.length);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    const hash = createHash('sha256').update(token).digest('hex');
    assert.equal(
      await db.session.count({ where: { tokenHash: token } }),
      0,
      'Token puro não deve ser armazenado.',
    );
    assert.equal(await db.session.count({ where: { tokenHash: hash } }), 1);
    return { cookie, hash };
  }
  const privateRoutes: [string, unknown?][] = [
    ['/api/declaracao/solicitacoes'],
    ['/api/declaracao/solicitacoes', {}],
    ['/api/secretaria/solicitacoes'],
    ['/api/secretaria/solicitacoes', {}],
    ['/api/secretaria/alunos', {}],
    ['/api/secretaria/declaracao', {}],
    ['/api/secretaria/declaracoes', {}],
  ];
  async function denied(label: string, cookie?: string) {
    for (const [path, body] of privateRoutes) {
      const response = await request(path, cookie, body);
      assert.equal(
        response.status,
        401,
        `${label}: ${path} exige sessão válida antes de processar dados.`,
      );
      assert.match(response.headers.get('cache-control')!, /no-store/);
      assert.deepEqual(
        Object.keys(await response.json()),
        ['error'],
        'Resposta recusada não deve carregar dados privados.',
      );
    }
    console.log(`OK: ${label}.`);
  }
  try {
    const a = await fixture('Aluno A', 'student');
    const b = await fixture('Aluno B', 'student');
    const staff = await fixture('Secretaria', 'secretary');
    let sessionA = await login(a.account.email!);
    const sessionB = await login(b.account.email!);
    const staffSession = await login(staff.account.email!);
    const individual = await db.account.create({
      data: {
        staffName: 'Funcionário Fictício',
        role: 'secretary',
        status: 'active',
        passwordHash,
        email: `secretaria-${suffix}@eteconectada.invalid`,
      },
    });
    assert.equal(individual.studentId, null);
    const individualSession = await login(individual.email!);
    assert.equal(
      (await request('/api/secretaria/solicitacoes', individualSession.cookie))
        .status,
      200,
    );
    assert.equal(
      (await request('/api/declaracao/solicitacoes', individualSession.cookie))
        .status,
      403,
    );
    await denied('sem cookie');
    await denied('cookie malformado', 'ete_portal_session=invalido');
    await denied(
      'token bem formado inexistente',
      `ete_portal_session=${randomBytes(32).toString('base64url')}`,
    );
    const tampered =
      sessionA.cookie.slice(0, -1) +
      (sessionA.cookie.endsWith('A') ? 'B' : 'A');
    await denied('token adulterado', tampered);

    const ids: string[] = [];
    for (const [person, session] of [
      [a, sessionA],
      [b, sessionB],
    ] as const) {
      const response = await request(
        '/api/declaracao/solicitacoes',
        session.cookie,
        { enrollmentId: person.student.enrollments[0].id },
      );
      assert.equal(response.status, 201);
      ids.push((await response.json()).request.id);
    }
    for (const [person, session, ownId, other] of [
      [a, sessionA, ids[0], b],
      [b, sessionB, ids[1], a],
    ] as const) {
      const response = await request(
        `/api/declaracao/solicitacoes?studentId=${other.student.id}&id=${ids[0]}&role=secretary`,
        session.cookie,
      );
      assert.equal(response.status, 200);
      const rows = (await response.json()).requests;
      assert.deepEqual(
        rows.map((row: { id: string }) => row.id),
        [ownId],
        'Parâmetros do cliente não substituem a identidade da sessão.',
      );
      assert.equal(
        JSON.stringify(rows).includes(other.student.fullName!),
        false,
      );
      const cross = await request(
        '/api/declaracao/solicitacoes',
        session.cookie,
        {
          studentId: other.student.id,
          enrollmentId: other.student.enrollments[0].id,
        },
      );
      assert.equal(cross.status, 422);
      assert.equal(
        await db.declarationRequest.count({
          where: { studentId: person.student.id },
        }),
        1,
      );
    }
    console.log('OK: isolamento entre dois alunos em consulta e escrita.');

    const fields = {
      studentId: a.student.id,
      enrollmentId: a.student.enrollments[0].id,
      naturality: 'Cidade fictícia/PE',
      parentOne: 'Filiação fictícia',
      courseName: 'Curso fictício',
      schoolPeriod: '2026',
      reviewed: true,
    };
    const staffRoutes: [string, unknown?][] = [
      ['/api/secretaria/solicitacoes'],
      ['/api/secretaria/alunos', { query: suffix }],
      ['/api/secretaria/declaracao', fields],
      ['/api/secretaria/declaracoes', { items: [fields] }],
      ['/api/secretaria/solicitacoes', { id: ids[0], confirmed: true }],
    ];
    for (const [path, body] of staffRoutes)
      assert.equal(
        (await request(path, sessionA.cookie, body)).status,
        403,
        `Aluno não acessa ${path}.`,
      );
    assert.equal(
      (await request('/api/declaracao/pdf', sessionA.cookie)).status,
      404,
    );
    const prepared = await request(
      '/api/secretaria/declaracao',
      staffSession.cookie,
      fields,
    );
    assert.equal(
      prepared.status,
      200,
      'Controle positivo: secretaria autorizada gera PDF.',
    );
    assert.equal(prepared.headers.get('content-type'), 'application/pdf');
    assert.match(prepared.headers.get('cache-control')!, /no-store/);
    assert.equal(
      Buffer.from(await prepared.arrayBuffer())
        .subarray(0, 5)
        .toString(),
      '%PDF-',
    );
    const before = await db.declarationRequest.findUniqueOrThrow({
      where: { id: ids[0] },
    });
    assert.equal(before.status, 'IN_PREPARATION');
    await db.account.update({
      where: { id: staff.account.id },
      data: { role: 'student' },
    });
    for (const [path, body] of staffRoutes)
      assert.equal(
        (await request(path, staffSession.cookie, body)).status,
        403,
        'Mudança de papel vale também para cookie já emitido.',
      );
    const after = await db.declarationRequest.findUniqueOrThrow({
      where: { id: ids[0] },
    });
    assert.deepEqual(
      after,
      before,
      'Tentativas recusadas não alteram o atendimento.',
    );
    await db.account.update({
      where: { id: staff.account.id },
      data: { role: 'secretary' },
    });
    assert.equal(
      (await request('/api/secretaria/solicitacoes', staffSession.cookie))
        .status,
      200,
    );
    console.log(
      'OK: papel conferido no servidor e revogação de privilégio em sessão existente.',
    );

    const sessionRow = await db.session.findUniqueOrThrow({
      where: { tokenHash: sessionA.hash },
    });
    await db.session.update({
      where: { tokenHash: sessionA.hash },
      data: { expiresAt: new Date(Date.now() - 60000) },
    });
    await denied('sessão expirada', sessionA.cookie);
    await db.session.update({
      where: { tokenHash: sessionA.hash },
      data: { expiresAt: sessionRow.expiresAt },
    });
    for (const status of ['pending', 'unclaimed']) {
      await db.account.update({
        where: { id: a.account.id },
        data: {
          status,
          ...(status === 'unclaimed'
            ? { email: null, passwordHash: null }
            : {}),
        },
      });
      await denied(`conta ${status}`, sessionA.cookie);
      assert.equal(
        (
          await request('/api/login', undefined, {
            identifier: a.account.email,
            password,
          })
        ).status,
        401,
      );
    }
    await db.account.update({
      where: { id: a.account.id },
      data: { status: 'active', email: a.account.email, passwordHash },
    });
    assert.equal(
      (await request('/api/declaracao/solicitacoes', sessionA.cookie)).status,
      200,
    );
    await db.session.delete({ where: { tokenHash: sessionA.hash } });
    await denied('sessão revogada no banco', sessionA.cookie);
    sessionA = await login(a.account.email!);
    const logout = await request('/api/logout', sessionA.cookie, {});
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie')!, /ete_portal_session=;/);
    assert.match(
      logout.headers.get('set-cookie')!,
      /(?:Max-Age=0|Expires=Thu, 01 Jan 1970)/i,
    );
    assert.equal(
      await db.session.count({ where: { tokenHash: sessionA.hash } }),
      0,
    );
    await denied('reuso do cookie após logout', sessionA.cookie);
    assert.equal(
      (await request('/api/declaracao/solicitacoes', sessionB.cookie)).status,
      200,
      'Logout de A não revoga B.',
    );
    assert.equal(
      (await request('/api/logout', undefined, {})).status,
      200,
      'Logout sem cookie continua idempotente.',
    );
    console.log(
      'OK: expiração, inatividade, revogação e logout isolado entre contas.',
    );
  } finally {
    await environment.close();
  }
}

main().catch(reportTestFailure);
