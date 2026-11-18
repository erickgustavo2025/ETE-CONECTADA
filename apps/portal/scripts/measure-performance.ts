import { syntheticEnrollmentValidity } from './enrollment-fixture';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { cpus, platform, arch } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import { openTestEnvironment, reportTestFailure } from './test-environment';
import { hashPassword } from '../src/lib/password';
import { hashSessionToken } from '../src/lib/session';
import {
  studentDeclarationSelect,
  validateDeclarationFields,
} from '../src/lib/declarations';
import { createDeclarationsPdf } from '../src/lib/declaration-pdf';

// Só números e metadados de ambiente saem do processo; nunca corpos/cookies/URLs.
type Sample = { ms: number; bytes: number; timing?: string };
function summary(samples: Sample[]) {
  const sorted = samples.map((s) => s.ms).sort((a, b) => a - b);
  const percentile = (p: number) =>
    Number(sorted[Math.ceil(sorted.length * p) - 1].toFixed(1));
  return {
    n: sorted.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: percentile(1),
    maxBytes: Math.max(...samples.map((s) => s.bytes)),
  };
}

async function main() {
  const measurements: Record<string, unknown> = {};
  // Três processos novos. PostgreSQL e cache de arquivos do SO não são reiniciados.
  for (let round = 1; round <= 3; round++) {
    const environment = await openTestEnvironment({ http: true });
    const { db, base } = environment;
    const ids = Array.from({ length: 500 }, () => randomUUID());
    const suffix = randomUUID();
    const className = `Carga sintética ${suffix}`;
    const password = 'CargaSintetica#123';
    const email = `secretaria-${suffix}@eteconectada.invalid`;
    try {
      await db.student.createMany({
        data: ids.map((id, i) => ({
          id,
          fullName: `Estudante sintético ${String(i).padStart(3, '0')}`,
          birthDate: new Date('2008-01-15T00:00:00Z'),
        })),
      });
      await db.enrollment.createMany({
        data: ids.map((studentId) => ({
          studentId,
          mode: 'INTEGRADO' as const,
          ...syntheticEnrollmentValidity(),
          className,
          grade: 2,
          courseLabel: 'DS',
          schoolYear: 2026,
        })),
      });
      const account = await db.account.create({
        data: {
          studentId: ids[0],
          role: 'secretary',
          status: 'active',
          email,
          passwordHash: await hashPassword(password),
        },
      });
      const token = randomBytes(32).toString('base64url');
      await db.session.create({
        data: {
          accountId: account.id,
          tokenHash: hashSessionToken(token),
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
      });
      const cookie = `ete_portal_session=${token}`;
      const rows = await db.student.findMany({
        where: { id: { in: ids.slice(0, 100) } },
        select: studentDeclarationSelect,
        orderBy: { id: 'asc' },
      });
      assert.equal(rows.length, 100);
      const items = rows.map((student) => ({
        student,
        fields: validateDeclarationFields({
          enrollmentId: student.enrollments[0].id,
          naturality: 'Recife/PE',
          parentOne: 'Filiação sintética',
          courseName: 'Desenvolvimento de Sistemas',
          schoolPeriod: '2026',
          reviewed: true,
        }),
      }));
      async function post(route: string, body: unknown, authenticated = false) {
        const start = performance.now();
        const response = await fetch(`${base}${route}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: base,
            ...(authenticated ? { Cookie: cookie } : {}),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        });
        const bytes = Buffer.from(await response.arrayBuffer());
        const ms = performance.now() - start;
        assert.equal(
          response.status,
          200,
          `Requisição sintética ${route} deve concluir com sucesso`,
        );
        assert.match(response.headers.get('cache-control') ?? '', /no-store/);
        if (route.endsWith('/alunos')) {
          const result = JSON.parse(bytes.toString());
          assert.equal(result.total, 500);
          assert.equal(result.students.length, 20);
          assert.equal(result.pageSize, 20);
        }
        if (route.endsWith('/declaracao')) {
          assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
          assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
        }
        return {
          ms,
          bytes: bytes.length,
          timing: response.headers.get('server-timing') ?? undefined,
        };
      }
      const routes = [
        {
          name: 'login',
          route: '/api/login',
          body: { identifier: email, password },
          auth: false,
        },
        {
          name: 'lista500_pagina20',
          route: '/api/secretaria/alunos',
          body: { className, page: 1 },
          auth: true,
        },
        {
          name: 'pdf_http1',
          route: '/api/secretaria/declaracao',
          body: { studentId: items[0].student.id, ...items[0].fields },
          auth: true,
        },
      ];
      for (const entry of routes) {
        const first = await post(entry.route, entry.body, entry.auth);
        const warm: Sample[] = [];
        for (let i = 0; i < 20; i++)
          warm.push(await post(entry.route, entry.body, entry.auth));
        measurements[`round${round}_${entry.name}`] = {
          firstMs: Number(first.ms.toFixed(1)),
          warm: summary(warm),
          ...(entry.name === 'login'
            ? {
                firstServerTiming: first.timing,
                warmLastServerTiming: warm.at(-1)?.timing,
              }
            : {}),
        };
      }
      // PDF direto: recursos deste processo Node, não do servidor HTTP separado.
      // A primeira chamada de cada processo mede fontes/imagem sem cache local.
      if (round === 1) {
        for (const size of [1, 20, 100]) {
          const samples: Sample[] = [];
          const cpuBefore = process.cpuUsage();
          for (let i = 0; i < 6; i++) {
            const start = performance.now();
            const pdf = await createDeclarationsPdf(items.slice(0, size));
            const ms = performance.now() - start;
            assert.equal((await PDFDocument.load(pdf)).getPageCount(), size);
            samples.push({ ms, bytes: pdf.length });
          }
          const cpu = process.cpuUsage(cpuBefore);
          measurements[`pdf_direct${size}`] = {
            firstMs: Number(samples[0].ms.toFixed(1)),
            warm: summary(samples.slice(1)),
            cpuTotalMs: Number(((cpu.user + cpu.system) / 1000).toFixed(1)),
            processPeakRssMiB: Number(
              (process.resourceUsage().maxRSS / 1024).toFixed(1),
            ),
          };
        }
      }
    } finally {
      await environment.close();
    }
  }
  console.log(
    JSON.stringify(
      {
        version: 1,
        environment: {
          node: process.version,
          platform: platform(),
          arch: arch(),
          logicalCpus: cpus().length,
          cpu: cpus()[0]?.model,
          nextMode: 'development-webpack',
          database: 'PostgreSQL loopback descartável',
          concurrency: 1,
          syntheticStudents: 500,
          coldDefinition:
            'Primeira requisição por rota em processo Next novo; SO/PostgreSQL/cache de compilação em disco podem estar aquecidos',
        },
        measurements,
      },
      null,
      2,
    ),
  );
}
main().catch(reportTestFailure);
