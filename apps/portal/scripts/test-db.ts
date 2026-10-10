import assert from "node:assert/strict";
import { randomBytes, randomInt, createHash } from "node:crypto";
import { openTestEnvironment, reportTestFailure } from "./test-environment";
import { claimAccount, verifyAccount } from "../src/lib/account-registration";
import { hashPassword } from "../src/lib/password";

async function main() {
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  let studentId: string | undefined;
  const cpfDigits = Array.from({ length: 9 }, () => randomInt(10));
  for (let n = 9; n < 11; n++) {
    const digit =
      (cpfDigits.reduce((sum, d, i) => sum + d * (n + 1 - i), 0) * 10) % 11;
    cpfDigits.push(digit === 10 ? 0 : digit);
  }
  const cpf = cpfDigits.join("");
  const schoolRegistration = String(randomInt(10000000, 99999999));
  const birthDate = new Date("2008-01-15T00:00:00Z");
  const email = `prisma-test-${randomBytes(8).toString("hex")}@eteconectada.invalid`;
  const password = randomBytes(20).toString("base64url");
  const tokens = [
    randomBytes(32).toString("base64url"),
    randomBytes(32).toString("base64url"),
  ];
  const hash = (v: string) => createHash("sha256").update(v).digest("hex");
  async function post(path: string, data: unknown, cookie?: string) {
    return fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(data),
    });
  }
  try {
    const student = await db.student.create({
      data: {
        cpf,
        schoolRegistration,
        birthDate,
        fullName: "Teste temporário Prisma",
      },
    });
    studentId = student.id;
    const check = await post("/api/registration/check", {
      schoolRegistration,
      birthDate: "2008-01-15",
    });
    assert.equal(check.status, 200);
    assert.equal((await check.json()).result, "eligible");
    const passwordHash = await hashPassword(password);
    const claims = await Promise.allSettled(
      tokens.map((token, index) =>
        claimAccount({
          schoolRegistration,
          cpf,
          birthDate,
          email: index === 0 ? email : `other-${email}`,
          password,
          passwordHash,
          tokenHash: hash(token),
        }),
      ),
    );
    assert.equal(
      claims.filter((r) => r.status === "fulfilled").length,
      1,
      "Uma única reivindicação deve vencer",
    );
    const winnerIndex = claims.findIndex((r) => r.status === "fulfilled");
    const loginEmail = winnerIndex === 0 ? email : `other-${email}`;
    const token = tokens[winnerIndex];
    assert.equal(
      (await post("/api/login", { identifier: cpf, password })).status,
      401,
    );
    assert.equal(
      (await post("/api/registration/verify", { token })).status,
      200,
    );
    await assert.rejects(verifyAccount(hash(token)), /invalid/);
    assert.equal(
      (await post("/api/registration/verify", { token })).status,
      400,
    );
    const account = await db.account.findUniqueOrThrow({
      where: { studentId },
    });
    const expiredHash = hash(randomBytes(32).toString("hex"));
    await db.emailVerificationToken.create({
      data: {
        tokenHash: expiredHash,
        accountId: account.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await assert.rejects(verifyAccount(expiredHash), /invalid/);
    assert.equal(
      (
        await post("/api/login", {
          identifier: cpf,
          password: "senha-incorreta",
        })
      ).status,
      401,
    );
    const login = await post("/api/login", { identifier: cpf, password });
    assert.equal(login.status, 200);
    console.log(
      "Tempos do login sintético:",
      login.headers.get("server-timing") ?? "indisponíveis",
    );
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (
        await post("/api/login", {
          identifier: loginEmail.toUpperCase(),
          password,
        })
      ).status,
      200,
    );
    const home = await fetch(base, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Teste temporário Prisma/);
    assert.equal((await post("/api/logout", {}, cookie)).status, 200);
    assert.equal(
      (await fetch(base, { headers: { Cookie: cookie }, redirect: "manual" }))
        .status,
      307,
    );
    console.log(
      "OK: concorrência, confirmação única, login CPF/e-mail, senha inválida, sessão e logout.",
    );
  } finally {
    try {
      // Exclui exclusivamente o aluno criado por esta execução; FKs removem seus dados dependentes.
      if (studentId) {
        await db.student.delete({ where: { id: studentId } });
      }
    } finally { await environment.close(); }
  }
}
main().catch(reportTestFailure);
