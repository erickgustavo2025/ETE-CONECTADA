import assert from 'node:assert/strict';
import { randomBytes, randomInt } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';

async function main() {
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const digits = Array.from({ length: 9 }, () => randomInt(10));
  for (let n = 9; n < 11; n++) {
    const check =
      (digits.reduce((sum, digit, i) => sum + digit * (n + 1 - i), 0) * 10) %
      11;
    digits.push(check === 10 ? 0 : check);
  }
  const cpf = digits.join('');
  const identity = {
    schoolRegistration: `0${randomInt(10000, 99999)}`,
    birthDate: '2008-01-15',
    parentName: 'Filiação Fictícia Um',
  };
  const suffix = randomBytes(8).toString('hex');
  const credentials = {
    email: `registration-${suffix}@eteconectada.invalid`,
    password: randomBytes(20).toString('base64url'),
  };
  let studentId: string | undefined;
  let secondStudentId: string | undefined;
  async function post(path: string, data: unknown) {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: base,
        ...(path === '/api/registration/start'
          ? { Host: 'evil.invalid', 'X-Forwarded-Host': 'evil.invalid' }
          : {}),
      },
      body: JSON.stringify(data),
    });
    return { status: response.status, body: await response.json() };
  }
  const check = () => post('/api/registration/check', identity);
  const start = (data = credentials, parentName = identity.parentName) =>
    post('/api/registration/start', {
      ...identity,
      ...data,
      cpf,
      confirmPassword: data.password,
      parentName,
    });
  const tokenFrom = (result: Awaited<ReturnType<typeof start>>) => {
    assert.equal(result.status, 200);
    assert.equal(
      result.body.result,
      'dev_link',
      'Execute sem o provedor de e-mail, usando o link de desenvolvimento.',
    );
    const url = new URL(result.body.verificationUrl, base);
    assert.equal(
      url.origin,
      new URL(base).origin,
      'Host não escolhe o destino do token.',
    );
    return url.searchParams.get('token')!;
  };
  const verify = (token: string) => post('/api/registration/verify', { token });
  try {
    // Exercita o adaptador HTTP, inclusive corpo chunked sem Content-Length.
    for (const path of [
      '/api/login',
      '/api/registration/check',
      '/api/registration/start',
      '/api/registration/verify',
    ]) {
      for (const value of [null, []])
        assert.equal((await post(path, value)).status, 400);
      assert.equal(
        (await post(path, { padding: 'a'.repeat(4096) })).status,
        413,
      );
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({ padding: 'a'.repeat(4096) }),
            ),
          );
          controller.close();
        },
      });
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: base },
        body: stream,
        duplex: 'half',
      } as RequestInit);
      assert.equal(response.status, 413);
      assert.deepEqual(Object.keys(await response.json()), ['error']);
    }
    // Antes da hidratação, o navegador usa o método HTML nativo. Nunca enviar senha na URL.
    const loginMarkup = await (await fetch(`${base}/login`)).text();
    const loginForm = loginMarkup.match(/<form\b[^>]*>/i)?.[0];
    assert.ok(loginForm, 'Login deve renderizar um formulário.');
    assert.match(
      loginForm,
      /\bmethod="post"/i,
      'Login sem JavaScript deve usar POST para não expor credenciais na URL.',
    );
    const student = await db.student.create({
      data: {
        schoolRegistration: identity.schoolRegistration,
        birthDate: new Date(`${identity.birthDate}T00:00:00Z`),
        fullName: 'Teste temporário de retomada',
        details: {
          create: {
            parentOne: identity.parentName,
            parentTwo: 'Filiação Fictícia Dois',
            parentageSource: 'SCHOOL_RECORD',
          },
        },
      },
    });
    studentId = student.id;
    const signup = {
      ...identity,
      ...credentials,
      cpf,
      confirmPassword: credentials.password,
    };
    for (const parentName of [
      undefined,
      null,
      [],
      {},
      'Filiação',
      'x'.repeat(181),
    ]) {
      assert.equal(
        (await post('/api/registration/check', { ...identity, parentName }))
          .status,
        400,
      );
      assert.equal(
        (await post('/api/registration/start', { ...signup, parentName }))
          .status,
        400,
      );
    }
    const unmatched = { status: 200, body: { result: 'unmatched' } };
    for (const parentName of [
      'Pessoa Desconhecida',
      'Filiação Um',
      'Filiação Fictícia Um Extra',
    ]) {
      assert.deepEqual(
        await post('/api/registration/check', { ...identity, parentName }),
        unmatched,
      );
      const denied = await post('/api/registration/start', {
        ...signup,
        parentName,
      });
      assert.equal(denied.status, 400);
      assert.deepEqual(Object.keys(denied.body), ['error']);
    }
    assert.deepEqual(
      await post('/api/registration/check', {
        ...identity,
        schoolRegistration: '00000000',
      }),
      unmatched,
    );
    await assert.rejects(
      db.studentDetails.update({
        where: { studentId },
        data: { parentageSource: 'STUDENT_DECLARATION' },
      }),
    );
    await db.studentDetails.update({
      where: { studentId },
      data: { parentOne: null, parentTwo: null, parentageSource: null },
    });
    assert.deepEqual(
      await check(),
      unmatched,
      'Ausência não pode ser exposta na resposta pública.',
    );
    assert.equal((await start()).status, 400);
    await db.studentDetails.delete({ where: { studentId } });
    assert.deepEqual(await check(), unmatched);
    assert.equal((await start()).status, 400);
    await db.studentDetails.create({ data: { studentId } });
    await db.studentDetails.update({
      where: { studentId },
      data: {
        parentOne: identity.parentName,
        parentTwo: 'Filiação Fictícia Dois',
        parentageSource: 'SCHOOL_RECORD',
      },
    });
    assert.equal(
      (
        await post('/api/registration/check', {
          ...identity,
          parentName: 'Pessoa Desconhecida',
        })
      ).body.result,
      'unmatched',
      'Filiação divergente não pode conferir cadastro.',
    );
    assert.equal((await check()).body.result, 'eligible');
    assert.equal(
      (
        await post('/api/registration/check', {
          ...identity,
          parentName: '  FILIACAO FICTICIA DOIS  ',
        })
      ).body.result,
      'eligible',
    );
    await db.student.update({
      where: { id: studentId },
      data: { registrationAllowed: false },
    });
    assert.deepEqual(await check(), unmatched);
    assert.equal((await start()).status, 400);
    await db.student.update({
      where: { id: studentId },
      data: { registrationAllowed: true },
    });
    // A aprovação da primeira tela não autoriza a chamada posterior após uma correção.
    await db.studentDetails.update({
      where: { studentId },
      data: { parentOne: 'Outro Nome Conferido' },
    });
    assert.equal((await start()).status, 400);
    await db.studentDetails.update({
      where: { studentId },
      data: { parentOne: identity.parentName },
    });
    assert.equal(await db.account.count({ where: { studentId } }), 0);
    assert.equal(
      (await db.student.findUniqueOrThrow({ where: { id: studentId } })).cpf,
      null,
    );
    assert.equal(
      (
        await post('/api/registration/start', {
          ...identity,
          ...credentials,
          cpf: '11111111111',
          confirmPassword: credentials.password,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post('/api/registration/start', {
          ...identity,
          ...credentials,
          cpf,
          confirmPassword: 'Diferente',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post('/api/registration/start', {
          ...identity,
          ...credentials,
          cpf,
          password: '1234567',
          confirmPassword: '1234567',
        })
      ).status,
      400,
    );
    assert.equal(
      await db.account.count({ where: { studentId } }),
      0,
      'Abrir ou fechar a segunda tela não deve criar uma conta.',
    );
    assert.equal(
      (
        await post('/api/registration/check', {
          ...identity,
          birthDate: '2008-01-16',
        })
      ).body.result,
      'unmatched',
    );
    // Separa as fixtures de filiação e retomada: não são uma única rajada real.
    // O teste EC060 cobre a pausa sem reiniciar contadores entre tentativas.
    await db.accessAttemptBucket.deleteMany();
    let firstToken = tokenFrom(
      await start(credentials, 'FILIACAO FICTICIA DOIS'),
    );
    const pendingAccount = await db.account.findUniqueOrThrow({
      where: { studentId },
    });
    const proof = await db.emailVerificationToken.findFirstOrThrow({
      where: { accountId: pendingAccount.id },
    });
    assert.match(proof.claimDataHash!, /^[0-9a-f]{64}$/);
    // Links legados e links emitidos antes de correção/bloqueio não ativam contas.
    await db.emailVerificationToken.update({
      where: { tokenHash: proof.tokenHash },
      data: { claimDataHash: null },
    });
    assert.equal((await verify(firstToken)).status, 400);
    firstToken = tokenFrom(await start());
    await db.studentDetails.update({
      where: { studentId },
      data: { parentTwo: 'Segundo Nome Corrigido' },
    });
    assert.equal((await verify(firstToken)).status, 400);
    assert.equal(
      (await db.account.findUniqueOrThrow({ where: { studentId } })).status,
      'pending',
    );
    await db.studentDetails.update({
      where: { studentId },
      data: { parentTwo: 'Filiação Fictícia Dois' },
    });
    firstToken = tokenFrom(await start());
    await db.student.update({
      where: { id: studentId },
      data: { registrationAllowed: false },
    });
    assert.equal((await verify(firstToken)).status, 400);
    await db.student.update({
      where: { id: studentId },
      data: { registrationAllowed: true },
    });
    firstToken = tokenFrom(await start());
    const beforeRejected = await db.emailVerificationToken.findFirstOrThrow({
      where: { accountId: pendingAccount.id },
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      assert.deepEqual(
        await post('/api/registration/check', {
          ...identity,
          parentName: 'Pessoa Desconhecida',
        }),
        unmatched,
      );
      assert.equal(
        (await start(credentials, 'Pessoa Desconhecida')).status,
        400,
      );
    }
    assert.deepEqual(
      await db.emailVerificationToken.findFirstOrThrow({
        where: { accountId: pendingAccount.id },
      }),
      beforeRejected,
      'Tentativas inválidas não renovam nem consomem o link válido.',
    );
    assert.equal(
      (await db.account.findUniqueOrThrow({ where: { studentId } })).email,
      credentials.email,
    );
    assert.equal(
      (await db.student.findUniqueOrThrow({ where: { id: studentId } })).cpf,
      cpf,
    );
    const secondStudent = await db.student.create({
      data: {
        schoolRegistration: String(randomInt(10000000, 99999999)),
        birthDate: new Date(`${identity.birthDate}T00:00:00Z`),
        fullName: 'Teste temporário de CPF repetido',
        details: {
          create: {
            parentOne: identity.parentName,
            parentageSource: 'SCHOOL_RECORD',
          },
        },
      },
    });
    secondStudentId = secondStudent.id;
    assert.equal(
      (
        await post('/api/registration/start', {
          ...identity,
          schoolRegistration: secondStudent.schoolRegistration,
          ...credentials,
          email: `duplicate-${credentials.email}`,
          cpf,
          confirmPassword: credentials.password,
        })
      ).status,
      409,
    );
    assert.equal(
      (await db.student.findUniqueOrThrow({ where: { id: secondStudentId } }))
        .cpf,
      null,
    );
    assert.equal(
      await db.account.count({ where: { studentId: secondStudentId } }),
      0,
    );
    assert.equal(
      (await check()).body.result,
      'pending',
      'Uma conta pendente deve permitir retornar à segunda tela.',
    );
    assert.equal(
      (
        await post('/api/login', {
          identifier: cpf,
          password: credentials.password,
        })
      ).status,
      401,
    );
    assert.equal(
      (await start({ ...credentials, email: `other-${credentials.email}` }))
        .status,
      409,
    );
    assert.equal(
      (await start({ ...credentials, password: 'OutraSenhaTemporaria@123' }))
        .status,
      409,
    );
    const renewedToken = tokenFrom(await start());
    assert.notEqual(firstToken, renewedToken);
    assert.equal(
      (await verify(firstToken)).status,
      400,
      'Renovar deve invalidar o link antigo.',
    );
    const account = await db.account.findUniqueOrThrow({
      where: { studentId },
    });
    assert.equal(
      await db.emailVerificationToken.count({
        where: { accountId: account.id },
      }),
      1,
    );
    await db.emailVerificationToken.updateMany({
      where: { accountId: account.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    assert.equal((await verify(renewedToken)).status, 400);
    const replacement = {
      email: `new-${credentials.email}`,
      password: 'Abcd1234',
    };
    const finalToken = tokenFrom(await start(replacement));
    assert.equal((await verify(renewedToken)).status, 400);
    assert.equal((await verify(finalToken)).status, 200);
    assert.equal(
      (await verify(finalToken)).status,
      400,
      'Um link só pode ser utilizado uma vez.',
    );
    assert.equal((await check()).body.result, 'created');
    assert.deepEqual(
      await post('/api/registration/check', {
        ...identity,
        parentName: 'Pessoa Desconhecida',
      }),
      unmatched,
    );
    assert.equal((await start(replacement, 'Pessoa Desconhecida')).status, 400);
    assert.equal(
      (await start(replacement)).status,
      409,
      'Uma conta ativa não pode ser sobrescrita pelo primeiro acesso.',
    );
    assert.equal(
      (
        await post('/api/login', {
          identifier: cpf,
          password: replacement.password,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await post('/api/login', {
          identifier: replacement.email,
          password: replacement.password,
        })
      ).status,
      200,
    );
    console.log(
      'OK: filiação completa por uma das duas referências escolares, respostas genéricas, chamada direta/entradas inválidas negadas, links legados/correção/bloqueio recusados, retomada protegida, expiração, confirmação única e login CPF/e-mail.',
    );
  } finally {
    try {
      if (studentId || secondStudentId)
        await db.student.deleteMany({
          where: {
            id: {
              in: [studentId, secondStudentId].filter(
                (id): id is string => !!id,
              ),
            },
          },
        });
    } finally {
      await environment.close();
    }
  }
}

main().catch(reportTestFailure);
