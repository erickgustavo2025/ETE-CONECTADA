import type { Prisma } from '../src/generated/prisma/client';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { subsequentFixture } from './subsequent-declaration-fixture';
import { syntheticEnrollmentValidity } from './enrollment-fixture';
import { recordGeneratedDeclarations } from '../src/lib/declaration-requests';
import { DeclarationValidationError } from '../src/lib/declarations';
async function main() {
  const environment = await openTestEnvironment({ http: true });
  const { db, base } = environment;
  const ids: string[] = [];
  const offerings: string[] = [];
  const post = (path: string, body: unknown, cookie: string) =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        Origin: base,
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify(body),
    });
  async function account(studentId: string, role: 'student' | 'secretary') {
    const row = await db.account.create({
      data: {
        studentId,
        role,
        status: 'active',
        email: randomUUID() + '@example.invalid',
        passwordHash: 'hash-ficticio-sem-login',
      },
    });
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        accountId: row.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    return { id: row.id, cookie: 'ete_portal_session=' + token };
  }
  try {
    const staff = await db.student.create({
      data: {
        fullName: 'Secretaria fictícia do modelo',
        birthDate: new Date('1990-01-01T00:00:00Z'),
      },
    });
    ids.push(staff.id);
    const actor = await account(staff.id, 'secretary');
    const members: Array<{
      person: Prisma.StudentGetPayload<{ include: { enrollments: true } }>;
      fixture: ReturnType<typeof subsequentFixture>;
      session: Awaited<ReturnType<typeof account>>;
    }> = [];
    for (const course of ['ADM', 'DS', 'ENF'] as const) {
      const fixture = subsequentFixture(course, course === 'ENF' ? 4 : 2);
      await db.courseOffering.create({
        data: {
          id: fixture.enrollment.offeringId,
          label: fixture.schedule.label,
          courseLabel: course,
          calendars: {
            create: {
              revision: 1,
              schedule: fixture.schedule,
              createdById: actor.id,
            },
          },
        },
      });
      offerings.push(fixture.enrollment.offeringId);
      const { offering, ...enrollment } = fixture.enrollment;
      void offering;
      const person = await db.student.create({
        data: {
          fullName: 'Estudante fictício ' + course,
          birthDate: fixture.student.birthDate,
          schoolRegistration: String(
            (randomBytes(4).readUInt32BE() % 90000000) + 10000000,
          ),
          details: {
            create: {
              parentOne: 'Filiação fictícia ' + course,
              parentageSource: 'SCHOOL_RECORD',
              birthCity: 'Recife',
              birthState: 'PE',
              birthCountry: 'BR',
              birthplaceSource: 'SCHOOL_RECORD',
            },
          },
          enrollments: { create: enrollment },
        },
        include: { enrollments: true },
      });
      ids.push(person.id);
      members.push({
        person,
        fixture,
        session: await account(person.id, 'student'),
      });
    }
    const first = members[0];
    const fields = (index: number) => ({
      studentId: members[index].person.id,
      enrollmentId: members[index].person.enrollments[0].id,
      naturality: 'Recife/PE',
      parentOne: 'Filiação fictícia',
      courseName: 'Campo adulterado ignorado',
      schoolPeriod: members[index].fixture.enrollment.periodLabel,
      reviewed: true,
    });
    const request = await post(
      '/api/declaracao/solicitacoes',
      { enrollmentId: first.person.enrollments[0].id },
      first.session.cookie,
    );
    assert.equal(
      request.status,
      201,
      'Subsequente deve poder pedir a própria declaração.',
    );
    assert.equal(
      (
        await post(
          '/api/declaracao/solicitacoes',
          { enrollmentId: members[1].person.enrollments[0].id },
          first.session.cookie,
        )
      ).status,
      422,
    );
    assert.equal(
      (
        await post(
          '/api/secretaria/declaracao',
          fields(0),
          first.session.cookie,
        )
      ).status,
      403,
    );
    const search = await post(
      '/api/secretaria/alunos',
      { query: first.person.fullName },
      actor.cookie,
    );
    const result = await search.json();
    assert.equal(search.status, 200);
    assert.equal(result.students[0].enrollments[0].moduleNumber, 2);
    assert.ok(result.students[0].enrollments[0].subsequent.startsOn);
    assert.equal('offering' in result.students[0].enrollments[0], false);
    const directory = await mkdtemp(join(tmpdir(), 'ete-subsequent-pdf-'));
    for (let index = 0; index < members.length; index++) {
      const response = await post(
        '/api/secretaria/declaracao',
        fields(index),
        actor.cookie,
      );
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
      await writeFile(join(directory, `curso-${index}.pdf`), bytes);
    }
    const integrated = await db.student.create({
      data: {
        fullName: 'Integrado fictício do lote misto',
        birthDate: new Date('2008-01-01T00:00:00Z'),
        enrollments: {
          create: {
            mode: 'INTEGRADO',
            className: 'Turma integrada fictícia',
            courseLabel: 'DS',
            grade: 2,
            ...syntheticEnrollmentValidity(),
          },
        },
      },
      include: { enrollments: true },
    });
    ids.push(integrated.id);
    const integratedFields = {
      ...fields(0),
      studentId: integrated.id,
      enrollmentId: integrated.enrollments[0].id,
      courseName: 'Desenvolvimento de Sistemas',
      schoolPeriod: integrated.enrollments[0].periodLabel,
    };
    const batch = await post(
      '/api/secretaria/declaracoes',
      {
        items: [integratedFields, ...members.map((_, index) => fields(index))],
      },
      actor.cookie,
    );
    assert.equal(batch.status, 200);
    const batchBytes = Buffer.from(await batch.arrayBuffer());
    assert.equal((await PDFDocument.load(batchBytes)).getPageCount(), 4);
    await writeFile(join(directory, 'lote-misto.pdf'), batchBytes);
    const target = members[1];
    await db.courseCalendarVersion.create({
      data: {
        offeringId: target.fixture.enrollment.offeringId,
        revision: 2,
        schedule: target.fixture.schedule,
        createdById: actor.id,
      },
    });
    assert.equal(
      (await post('/api/secretaria/declaracao', fields(1), actor.cookie))
        .status,
      422,
    );
    await db.declarationRequest.updateMany({
      where: { studentId: first.person.id },
      data: { status: 'REQUESTED', generatedAt: null, preparedById: null },
    });
    const rejected = await post(
      '/api/secretaria/declaracoes',
      { items: [fields(0), fields(1)] },
      actor.cookie,
    );
    assert.equal(rejected.status, 422);
    assert.equal(
      (
        await db.declarationRequest.findFirstOrThrow({
          where: { studentId: first.person.id },
        })
      ).status,
      'REQUESTED',
    );
    // Simula calendário alterado entre a leitura usada para o PDF e a gravação final.
    await assert.rejects(
      recordGeneratedDeclarations(
        [
          {
            studentId: target.person.id,
            enrollmentId: target.person.enrollments[0].id,
            periodLabel: target.fixture.enrollment.periodLabel!,
            reviewedAt: target.fixture.enrollment.reviewedAt,
            calendarRevision: 1,
          },
        ],
        actor.id,
      ),
      DeclarationValidationError,
    );
    console.log('PDFs fictícios do subsequente e lote misto: ' + directory);
    console.log(
      'OK: pedido subsequente, autorização/DTO mínimo,3cursos, lote misto, revisão obsoleta, revalidação após geração e lote inválido sem preparar outro aluno.',
    );
  } finally {
    try {
      await db.student.deleteMany({ where: { id: { in: ids } } });
      await db.courseCalendarVersion.deleteMany({
        where: { offeringId: { in: offerings } },
      });
      await db.courseOffering.deleteMany({ where: { id: { in: offerings } } });
    } finally {
      await environment.close();
    }
  }
}
main().catch(reportTestFailure);
