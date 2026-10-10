import assert from 'node:assert/strict';
import { randomBytes, randomInt } from 'node:crypto';
import { openTestEnvironment, reportTestFailure } from './test-environment';


async function main() {
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const digits = Array.from({ length: 9 }, () => randomInt(10));
  for (let n = 9; n < 11; n++) {
    const check = digits.reduce((sum, digit, i) => sum + digit * (n + 1 - i), 0) * 10 % 11;
    digits.push(check === 10 ? 0 : check);
  }
  const cpf = digits.join('');
  const identity = { schoolRegistration: String(randomInt(10000000, 99999999)), birthDate: '2008-01-15' };
  const suffix = randomBytes(8).toString('hex');
  const credentials = { email: `registration-${suffix}@eteconectada.invalid`, password: randomBytes(20).toString('base64url') };
  let studentId: string | undefined;
  let secondStudentId: string | undefined;
  async function post(path: string, data: unknown) {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(data) });
    return { status: response.status, body: await response.json() };
  }
  const check = () => post('/api/registration/check', identity);
  const start = (data = credentials) => post('/api/registration/start', { ...identity, ...data, cpf, confirmPassword: data.password });
  const tokenFrom = (result: Awaited<ReturnType<typeof start>>) => {
    assert.equal(result.status, 200);
    assert.equal(result.body.result, 'dev_link', 'Execute sem o provedor de e-mail, usando o link de desenvolvimento.');
    return new URL(result.body.verificationUrl).searchParams.get('token')!;
  };
  const verify = (token: string) => post('/api/registration/verify', { token });
  try {
    // Antes da hidratação, o navegador usa o método HTML nativo. Nunca enviar senha na URL.
    const loginMarkup = await (await fetch(`${base}/login`)).text();
    const loginForm = loginMarkup.match(/<form\b[^>]*>/i)?.[0];
    assert.ok(loginForm, 'Login deve renderizar um formulário.');
    assert.match(loginForm, /\bmethod="post"/i, 'Login sem JavaScript deve usar POST para não expor credenciais na URL.');
    const student = await db.student.create({ data: { schoolRegistration: identity.schoolRegistration, birthDate: new Date(`${identity.birthDate}T00:00:00Z`), fullName: 'Teste temporário de retomada' } });
    studentId = student.id;
    assert.equal((await check()).body.result, 'eligible');
    assert.equal((await db.student.findUniqueOrThrow({ where: { id: studentId } })).cpf, null);
    assert.equal((await post('/api/registration/start', { ...identity, ...credentials, cpf: '11111111111', confirmPassword: credentials.password })).status, 400);
    assert.equal((await post('/api/registration/start', { ...identity, ...credentials, cpf, confirmPassword: 'Diferente' })).status, 400);
    assert.equal((await post('/api/registration/start', { ...identity, ...credentials, cpf, password: '1234567', confirmPassword: '1234567' })).status, 400);
    assert.equal(await db.account.count({ where: { studentId } }), 0, 'Abrir ou fechar a segunda tela não deve criar uma conta.');
    assert.equal((await post('/api/registration/check', { ...identity, birthDate: '2008-01-16' })).body.result, 'unmatched');
    const firstToken = tokenFrom(await start());
    assert.equal((await db.student.findUniqueOrThrow({ where: { id: studentId } })).cpf, cpf);
    const secondStudent = await db.student.create({ data: { schoolRegistration: String(randomInt(10000000, 99999999)), birthDate: new Date(`${identity.birthDate}T00:00:00Z`), fullName: 'Teste temporário de CPF repetido' } });
    secondStudentId = secondStudent.id;
    assert.equal((await post('/api/registration/start', { ...identity, schoolRegistration: secondStudent.schoolRegistration, ...credentials, email: `duplicate-${credentials.email}`, cpf, confirmPassword: credentials.password })).status, 409);
    assert.equal((await db.student.findUniqueOrThrow({ where: { id: secondStudentId } })).cpf, null);
    assert.equal(await db.account.count({ where: { studentId: secondStudentId } }), 0);
    assert.equal((await check()).body.result, 'pending', 'Uma conta pendente deve permitir retornar à segunda tela.');
    assert.equal((await post('/api/login', { identifier: cpf, password: credentials.password })).status, 401);
    assert.equal((await start({ ...credentials, email: `other-${credentials.email}` })).status, 409);
    assert.equal((await start({ ...credentials, password: 'OutraSenhaTemporaria@123' })).status, 409);
    const renewedToken = tokenFrom(await start());
    assert.notEqual(firstToken, renewedToken);
    assert.equal((await verify(firstToken)).status, 400, 'Renovar deve invalidar o link antigo.');
    const account = await db.account.findUniqueOrThrow({ where: { studentId } });
    assert.equal(await db.emailVerificationToken.count({ where: { accountId: account.id } }), 1);
    await db.emailVerificationToken.updateMany({ where: { accountId: account.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await verify(renewedToken)).status, 400);
    const replacement = { email: `new-${credentials.email}`, password: 'Abcd1234' };
    const finalToken = tokenFrom(await start(replacement));
    assert.equal((await verify(renewedToken)).status, 400);
    assert.equal((await verify(finalToken)).status, 200);
    assert.equal((await verify(finalToken)).status, 400, 'Um link só pode ser utilizado uma vez.');
    assert.equal((await check()).body.result, 'created');
    assert.equal((await start(replacement)).status, 409, 'Uma conta ativa não pode ser sobrescrita pelo primeiro acesso.');
    assert.equal((await post('/api/login', { identifier: cpf, password: replacement.password })).status, 200);
    assert.equal((await post('/api/login', { identifier: replacement.email, password: replacement.password })).status, 200);
    console.log('OK: matrícula/nascimento, CPF validado no servidor, senha mínima e confirmação, segunda tela sem conta, retomada pendente, proteção das credenciais, renovação, expiração, confirmação única e login CPF/e-mail.');
  } finally {
    try {
      if (studentId || secondStudentId) await db.student.deleteMany({ where: { id: { in: [studentId, secondStudentId].filter((id): id is string => !!id) } } });
    } finally { await environment.close(); }
  }
}

main().catch(reportTestFailure);
