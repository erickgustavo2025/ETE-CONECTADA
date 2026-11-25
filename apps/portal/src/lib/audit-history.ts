import { Prisma } from '@/generated/prisma/client';
import { getDb } from './db';
import { validRequestId } from './declaration-requests';

import type { AuditEvent, AuditFilters } from './audit-history-input';

const accents = 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ';
const ascii = accents.normalize('NFD').replace(/\p{M}/gu, '');
const searchName = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const pageSize = 20;

export async function listAuditHistory(
  accountId: string,
  filters: AuditFilters,
) {
  if (!validRequestId(accountId)) return null;
  const filtersSql = [
    filters.category
      ? Prisma.sql`e.category = ${filters.category}`
      : Prisma.empty,
    filters.student
      ? Prisma.sql`(strpos(lower(translate(normalize(s.full_name), ${accents}, ${ascii})), ${searchName(filters.student)}) > 0 OR starts_with(s.school_registration, ${filters.student}))`
      : Prisma.empty,
    filters.from
      ? Prisma.sql`e.at >= (${filters.from}::date::timestamp AT TIME ZONE 'America/Recife')`
      : Prisma.empty,
    filters.until
      ? Prisma.sql`e.at < ((${filters.until}::date + 1)::timestamp AT TIME ZONE 'America/Recife')`
      : Prisma.empty,
  ].filter((condition) => condition !== Prisma.empty);
  const where = filtersSql.length
    ? Prisma.sql`WHERE ${Prisma.join(filtersSql, ' AND ')}`
    : Prisma.empty;
  return getDb().$transaction(async (tx) => {
    const [actor] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM accounts
      WHERE id=${accountId}::uuid AND role='secretary' AND status='active'
      FOR SHARE
    `;
    if (!actor) return null;
    // O resultado tem uma lista explícita de campos. Não retorna snapshots, PDFs,
    // dados de filiação, CPF ou credenciais.
    const events = await tx.$queryRaw<AuditEvent[]>`
      WITH events(category, id, action, at, student_id, subject, actor_id,
        actor_label, reason, operation, automatic, confirmer, confirmed_at, correction) AS (
        SELECT 'ACESSO', c.id, c.kind || CASE WHEN c.blocked THEN '_BLOCK' ELSE '_UNBLOCK' END,
          c.created_at, c.student_id, NULL, c.created_by_id, NULL, c.reason,
          c.request_key::text, false, NULL, NULL, NULL
        FROM student_access_changes c
        UNION ALL
        SELECT 'ACESSO', e.id, e.action, e.created_at, a.student_id,
          NULL, e.account_id, NULL, NULL, e.id::text, false, NULL, NULL, NULL
        FROM account_security_events e JOIN accounts a ON a.id=e.account_id
        UNION ALL
        SELECT 'MATRICULA', a.id, a.kind, a.created_at, n.student_id,
          COALESCE(a.after_state->>'className', n.class_name), a.actor_id,
          a.after_state->>'actorLabel', a.reason, a.operation_key,
          a.actor_id IS NULL AND a.kind IN ('PROGRESSION','CONTINUITY'),
          CASE WHEN a.actor_id IS NULL AND a.kind IN ('PROGRESSION','CONTINUITY')
            THEN a.before_state->>'reviewedById' END,
          CASE WHEN a.actor_id IS NULL AND a.kind IN ('PROGRESSION','CONTINUITY')
            THEN a.before_state->>'reviewedAt' END,
          a.after_state->>'correctsEventId'
        FROM school_academic_events a JOIN enrollments n ON n.id=a.enrollment_id
        UNION ALL
        SELECT 'IMPORTACAO', h.id, h.reason, h.recorded_at, n.student_id,
          h.class_name, h.recorded_by_id, NULL, NULL, h.id::text, false, NULL, NULL, NULL
        FROM enrollment_import_history h JOIN enrollments n ON n.id=h.enrollment_id
        UNION ALL
        SELECT 'CALENDARIO', v.id, 'CALENDAR_CHANGE', v.created_at, NULL,
          o.label, v.created_by_id, NULL, NULL, v.id::text, false, NULL, NULL, NULL
        FROM course_calendar_versions v JOIN course_offerings o ON o.id=v.offering_id
        UNION ALL
        SELECT 'DECLARACAO', d.id, CASE WHEN d.status='ISSUED' THEN 'ISSUED' ELSE 'DRAFTED' END,
          d.created_at, d.student_id, NULL, d.created_by_id, NULL, NULL,
          COALESCE(d.request_key::text,d.id::text), false, NULL, NULL, NULL
        FROM declaration_documents d
        UNION ALL
        SELECT 'DECLARACAO', c.document_id, c.action, c.created_at, c.student_id,
          NULL, c.created_by_id, NULL, c.reason, c.document_id::text, false, NULL, NULL, NULL
        FROM declaration_document_actions c
      )
      SELECT e.category, e.id::text, e.action, e.at, s.full_name AS student,
        s.school_registration AS registration, e.subject,
        COALESCE(e.actor_label, staff_account.staff_name, staff.full_name) AS actor,
        e.reason, e.operation, e.automatic, COALESCE(confirm_account.staff_name, confirm_staff.full_name) AS "confirmedBy",
        e.confirmed_at AS "confirmedAt", e.correction AS "correctsEventId"
      FROM events e
      LEFT JOIN students s ON s.id=e.student_id
      LEFT JOIN accounts staff_account ON staff_account.id=e.actor_id
      LEFT JOIN students staff ON staff.id=staff_account.student_id
      LEFT JOIN accounts confirm_account ON confirm_account.id::text=e.confirmer
      LEFT JOIN students confirm_staff ON confirm_staff.id=confirm_account.student_id
      ${where}
      ORDER BY e.at DESC, e.category, e.id, e.action
      LIMIT ${pageSize + 1} OFFSET ${pageSize * (filters.page - 1)}
    `;
    return {
      events: events.slice(0, pageSize),
      hasNext: events.length > pageSize,
    };
  });
}
