import { Prisma } from '@/generated/prisma/client';
import { getDb } from './db';
import { RequestError, validRequestId } from './declaration-requests';
import { DeclarationValidationError } from './declarations';
import type { DocumentListItem, DocumentState } from './document-search-types';

const documentSelect = {
  id: true,
  createdAt: true,
  sourcePdfPage: true,
  snapshot: true,
  status: true,
  terminalActions: { select: { action: true } },
} satisfies Prisma.DeclarationDocumentSelect;
function snapshotText(snapshot: Prisma.JsonValue, key: string) {
  const value =
    snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
      ? snapshot[key]
      : null;
  return typeof value === 'string' ? value : '';
}
function summary(
  row: Prisma.DeclarationDocumentGetPayload<{ select: typeof documentSelect }>,
): DocumentListItem {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    state: (row.terminalActions[0]?.action ?? row.status) as DocumentState,
    className: snapshotText(row.snapshot, 'className'),
    mode: snapshotText(row.snapshot, 'mode'),
    period: snapshotText(row.snapshot, 'periodLabel'),
    page: row.sourcePdfPage,
  };
}
function text(body: Record<string, unknown>, key: string, max = 180) {
  if (body[key] === undefined || body[key] === '') return '';
  if (typeof body[key] !== 'string' || body[key].length > max)
    throw new DeclarationValidationError('Confira os filtros da busca.', key);
  return body[key].trim();
}
function day(value: string, key: string) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new DeclarationValidationError('Confira a data informada.', key);
  const date = new Date(value + 'T00:00:00-03:00');
  if (
    !Number.isFinite(date.getTime()) ||
    new Date(date.getTime() - 3 * 3600000).toISOString().slice(0, 10) !== value
  )
    throw new DeclarationValidationError('Confira a data informada.', key);
  return date;
}
export async function searchDocuments(body: Record<string, unknown>) {
  const allowed = [
    'documentId',
    'query',
    'className',
    'mode',
    'status',
    'studentId',
    'from',
    'to',
    'page',
    'records',
  ];
  if (Object.keys(body).some((key) => !allowed.includes(key)))
    throw new DeclarationValidationError('Confira os filtros da busca.');
  const records = body.records ?? 'documents';
  if (!['documents', 'requests'].includes(String(records)))
    throw new DeclarationValidationError('Escolha documentos ou solicitações.');
  const db = getDb();
  const documentId = text(body, 'documentId', 36);
  if (documentId) {
    if (!validRequestId(documentId))
      throw new DeclarationValidationError('Escolha uma minuta válida.');
    const row = await db.declarationDocument.findUnique({
      where: { id: documentId.toLowerCase() },
      select: {
        ...documentSelect,
        studentId: true,
        publicCode: true,
        enrollmentId: true,
        sourcePdfSha256: true,
        archiveSha256: true,
        createdBy: { select: { student: { select: { fullName: true } } } },
        terminalActions: {
          select: {
            action: true,
            reason: true,
            createdAt: true,
            successorId: true,
            createdBy: { select: { student: { select: { fullName: true } } } },
          },
        },
      },
    });
    if (!row)
      throw new RequestError('Minuta não encontrada. Atualize a lista.', 404);
    const period = snapshotText(row.snapshot, 'periodLabel');
    const successors =
      period && row.status === 'DRAFT'
        ? await db.declarationDocument.findMany({
            where: {
              studentId: row.studentId,
              enrollmentId: row.enrollmentId,
              status: row.status,
              id: { not: row.id },
              ...(row.status === 'DRAFT'
                ? { snapshot: { path: ['periodLabel'], equals: period } }
                : {}),
              terminalActions: { none: {} },
              predecessorActions: { none: {} },
            },
            select: documentSelect,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 100,
          })
        : [];
    return {
      document: {
        ...summary(row),
        verificationPath:
          row.status === 'ISSUED' &&
          row.snapshot &&
          typeof row.snapshot === 'object' &&
          !Array.isArray(row.snapshot) &&
          row.snapshot.verificationVersion === 1
            ? '/validar/' + row.publicCode
            : null,
        body: snapshotText(row.snapshot, 'body'),
        hasOriginal: row.archiveSha256 !== null,
        sourcePdfSha256: row.sourcePdfSha256,
        history: [
          {
            action: row.status,
            date: row.createdAt.toISOString(),
            actor:
              row.createdBy.student.fullName ??
              'Nome do responsável não informado',
            reason: null,
            relatedId: null,
          },
          ...row.terminalActions.map((a) => ({
            action: a.action,
            date: a.createdAt.toISOString(),
            actor:
              a.createdBy.student.fullName ??
              'Nome do responsável não informado',
            reason: a.reason,
            relatedId: a.successorId,
          })),
        ],
      },
      successors: successors.map(summary),
    };
  }
  const query = text(body, 'query'),
    className = text(body, 'className', 120),
    mode = text(body, 'mode', 20),
    status = text(body, 'status', 20),
    studentId = text(body, 'studentId', 36);
  if (query && query.length < 2)
    throw new DeclarationValidationError(
      'Digite pelo menos duas letras ou números.',
      'query',
    );
  if (studentId && !validRequestId(studentId))
    throw new DeclarationValidationError('Escolha um aluno válido.');
  if (mode && !['INTEGRADO', 'SUBSEQUENTE'].includes(mode))
    throw new DeclarationValidationError(
      'Escolha Integrado ou Subsequente.',
      'mode',
    );
  if (
    status &&
    !(
      records === 'requests'
        ? ['REQUESTED', 'IN_PREPARATION', 'READY_FOR_PICKUP', 'AVAILABLE']
        : ['DRAFT', 'ISSUED', 'CANCELLED', 'SUPERSEDED']
    ).includes(status)
  )
    throw new DeclarationValidationError(
      'Escolha uma situação válida.',
      'status',
    );
  const from = day(text(body, 'from', 10), 'from'),
    to = day(text(body, 'to', 10), 'to');
  if (from && to && from > to)
    throw new DeclarationValidationError(
      'A data final precisa ser igual ou posterior à inicial.',
      'to',
    );
  const page = body.page === undefined ? 1 : Number(body.page);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
    throw new DeclarationValidationError('Escolha uma página válida.');
  if (records === 'requests') {
    const where: Prisma.DeclarationRequestWhereInput = {
      ...(status
        ? {
            status: status as
              | 'REQUESTED'
              | 'IN_PREPARATION'
              | 'READY_FOR_PICKUP'
              | 'AVAILABLE',
          }
        : {}),
      ...(studentId ? { studentId: studentId.toLowerCase() } : {}),
      ...(mode || className
        ? {
            enrollment: {
              ...(mode ? { mode: mode as 'INTEGRADO' | 'SUBSEQUENTE' } : {}),
              ...(className ? { className } : {}),
            },
          }
        : {}),
      ...(query
        ? {
            student: {
              OR: [
                { fullName: { contains: query, mode: 'insensitive' } },
                { schoolRegistration: { startsWith: query } },
              ],
            },
          }
        : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lt: new Date(to.getTime() + 86400000) } : {}),
            },
          }
        : {}),
    };
    return db.$transaction(
      async (tx) => {
        const total = await tx.declarationRequest.count({ where });
        const actual = Math.min(page, Math.max(1, Math.ceil(total / 20)));
        const rows = await tx.declarationRequest.findMany({
          where,
          select: {
            id: true,
            status: true,
            createdAt: true,
            student: { select: { fullName: true, schoolRegistration: true } },
            enrollment: {
              select: { className: true, mode: true, periodLabel: true },
            },
            document: {
              select: {
                id: true,
                status: true,
                terminalActions: { select: { action: true } },
              },
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (actual - 1) * 20,
          take: 20,
        });
        return {
          students: [],
          documents: [],
          requests: rows.map((r) => ({
            id: r.id,
            name: r.student.fullName ?? 'Aluno sem nome informado',
            registration: r.student.schoolRegistration,
            status: r.status,
            createdAt: r.createdAt.toISOString(),
            className: r.enrollment.className,
            mode: r.enrollment.mode,
            period: r.enrollment.periodLabel,
            document: r.document
              ? {
                  id: r.document.id,
                  state: (r.document.terminalActions[0]?.action ??
                    r.document.status) as DocumentState,
                }
              : null,
          })),
          total,
          page: actual,
          pageSize: 20,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  const filters: Prisma.DeclarationDocumentWhereInput[] = [];
  if (className)
    filters.push({ snapshot: { path: ['className'], equals: className } });
  if (mode) filters.push({ snapshot: { path: ['mode'], equals: mode } });
  if (status)
    filters.push(
      status === 'DRAFT' || status === 'ISSUED'
        ? { status, terminalActions: { none: {} } }
        : { terminalActions: { some: { action: status } } },
    );
  if (from || to)
    filters.push({
      createdAt: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lt: new Date(to.getTime() + 86400000) } : {}),
      },
    });
  const documentWhere: Prisma.DeclarationDocumentWhereInput = { AND: filters };
  const pageSize = 20;
  return db.$transaction(
    async (tx) => {
      if (studentId) {
        const where = { ...documentWhere, studentId: studentId.toLowerCase() };
        const total = await tx.declarationDocument.count({ where });
        const actual = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
        const rows = await tx.declarationDocument.findMany({
          where,
          select: documentSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (actual - 1) * pageSize,
          take: pageSize,
        });
        return {
          students: [],
          documents: rows.map(summary),
          total,
          page: actual,
          pageSize,
        };
      }
      const where: Prisma.StudentWhereInput = {
        declarationDocuments: { some: documentWhere },
        ...(query
          ? {
              OR: [
                { fullName: { contains: query, mode: 'insensitive' } },
                { schoolRegistration: { startsWith: query } },
              ],
            }
          : {}),
      };
      const total = await tx.student.count({ where });
      const actual = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
      const rows = await tx.student.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          schoolRegistration: true,
          _count: {
            select: { declarationDocuments: { where: documentWhere } },
          },
        },
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        skip: (actual - 1) * pageSize,
        take: pageSize,
      });
      return {
        students: rows.map((s) => ({
          id: s.id,
          name: s.fullName ?? 'Aluno sem nome informado',
          registration: s.schoolRegistration,
          count: s._count.declarationDocuments,
        })),
        documents: [],
        total,
        page: actual,
        pageSize,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
