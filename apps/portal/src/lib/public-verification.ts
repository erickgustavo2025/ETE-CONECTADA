import { Prisma } from '@/generated/prisma/client';
import { getDb } from './db';
import { declarationPortalEnabled } from './declaration-documents';
import {
  documentNameMatches,
  maskDocumentName,
  validDocumentCode,
} from './public-verification-input';
import type { PublicVerification } from './public-verification-types';

// Whitelist nova: nunca serializar o snapshot privado nem as relações completas.
export async function readPublicVerification(
  code: string,
  fullName: string | null,
): Promise<PublicVerification | null> {
  if (!declarationPortalEnabled() || !validDocumentCode(code)) return null;
  return getDb().$transaction(
    async (tx) => {
      const checkedAt = new Date().toISOString();
      const row = await tx.declarationDocument.findUnique({
        where: { publicCode: code },
        select: {
          publicCode: true,
          status: true,
          origin: true,
          snapshotVersion: true,
          snapshot: true,
          createdAt: true,
          sourcePdfSha256: true,
          sourcePdfPage: true,
          archive: { select: { templateVersion: true } },
          currentIssues: { select: { documentType: true } },
          terminalActions: { select: { action: true } },
        },
      });
      if (!row) return null;
      const snapshot = row.snapshot;
      if (
        !snapshot ||
        typeof snapshot !== 'object' ||
        Array.isArray(snapshot) ||
        snapshot.verificationVersion !== 1 ||
        row.status !== 'ISSUED' ||
        row.origin !== 'STUDENT_REQUEST'
      )
        return null;
      const field = (key: string, max = 180) => {
        const v = snapshot[key];
        if (typeof v !== 'string' || !v.trim() || v.length > max)
          throw new Error('Registro de verificação incompleto.');
        return v;
      };
      const preview =
        row.snapshotVersion === 2 &&
        snapshot.testOnly === true &&
        row.archive?.templateVersion === 'minuta-a4-qr-v1';
      const school =
        row.snapshotVersion === 3 &&
        snapshot.testOnly === false &&
        snapshot.issuanceMode === 'SCHOOL' &&
        row.archive?.templateVersion === 'vinculo-a4-qr-v1';
      if ((!preview && !school) || row.sourcePdfPage !== 1)
        throw new Error('Arquivo de verificação indisponível.');
      const mode = field('mode'),
        number = mode === 'INTEGRADO' ? snapshot.grade : snapshot.moduleNumber;
      if (
        !['INTEGRADO', 'SUBSEQUENTE'].includes(mode) ||
        typeof number !== 'number' ||
        !Number.isInteger(number) ||
        number < 1 ||
        number > (mode === 'INTEGRADO' ? 3 : 4)
      )
        throw new Error('Registro escolar de verificação incompleto.');
      const terminal = row.terminalActions[0]?.action;
      let state: PublicVerification['state'];
      if (terminal === 'CANCELLED' || terminal === 'SUPERSEDED')
        state = terminal;
      else if (
        !terminal &&
        row.currentIssues.length === 1 &&
        row.currentIssues[0].documentType === 'DECLARACAO_VINCULO'
      )
        state = 'VALID';
      else throw new Error('Situação de verificação indisponível.');
      const name = field('subjectName');
      const socialName =
        typeof snapshot.socialName === 'string' &&
        snapshot.socialName.trim() &&
        snapshot.socialName.length <= 180
          ? snapshot.socialName
          : '';
      const legalMatch =
        fullName === null ? false : documentNameMatches(name, fullName);
      const socialMatch =
        fullName === null || !socialName
          ? false
          : documentNameMatches(socialName, fullName);
      return {
        code: row.publicCode,
        state,
        checkedAt,
        testOnly: preview,
        pdfSha256: row.sourcePdfSha256,
        nameMatches: fullName === null ? null : legalMatch || socialMatch,
        document: {
          nameMasked: maskDocumentName(socialName || name),
          issuer: 'Escola Técnica Estadual Advogado José David Gil Rodrigues',
          type: 'Declaração de vínculo',
          issuedAt: row.createdAt.toISOString(),
          course: field('courseName'),
          mode: mode === 'INTEGRADO' ? 'Integrado' : 'Subsequente',
          level: number + (mode === 'INTEGRADO' ? 'º ano' : 'º módulo'),
          period: field('periodLabel', 20),
        },
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 3000,
      timeout: 5000,
    },
  );
}
