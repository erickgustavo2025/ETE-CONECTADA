import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { declarationMode } from './declaration-configuration';
export { declarationPortalEnabled } from './declaration-configuration';
import type { Prisma } from '../generated/prisma/client';
import {
  declarationBody,
  DeclarationValidationError,
  type DeclarationFields,
  type DeclarationStudent,
} from './declarations';

export function declarationRegistryPreviewEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return declarationMode(env) === 'PREVIEW';
}
export type PreparedDeclarationDocument = {
  id: string;
  publicCode: string;
  studentId: string;
  enrollmentId: string;
  snapshotVersion: number;
  snapshot: Prisma.InputJsonObject;
  sourcePdfPage: number;
};

export function prepareDeclarationDocuments(
  items: { student: DeclarationStudent; fields: DeclarationFields }[],
): PreparedDeclarationDocument[] {
  if (!items.length || items.length > 100)
    throw new DeclarationValidationError(
      'Selecione de 1 a 100 declarações por PDF.',
    );
  return items.map(({ student, fields }, index) => {
    const enrollment = student.enrollments.find(
      (row) => row.id === fields.enrollmentId,
    );
    if (!enrollment)
      throw new DeclarationValidationError('Matrícula não disponível.');
    return {
      id: randomUUID(),
      // Identificador público de consulta; nunca autoriza acesso ao PDF ou cadastro.
      publicCode: randomBytes(32).toString('base64url'),
      studentId: student.id,
      enrollmentId: enrollment.id,
      sourcePdfPage: index + 1,
      snapshotVersion: 1,
      snapshot: {
        type: 'DECLARACAO_VINCULO',
        mode: enrollment.mode,
        className: enrollment.className,
        periodLabel: fields.schoolPeriod,
        body: declarationBody(student, fields),
        socialName: fields.socialName,
        secretaryName: fields.secretaryName,
        secretaryRegistration: fields.secretaryRegistration,
        directorName: fields.directorName,
        directorRegistration: fields.directorRegistration,
      },
    };
  });
}

export function documentInsertData(
  records: PreparedDeclarationDocument[],
  pdf: Uint8Array,
  accountId: string,
): Prisma.DeclarationDocumentCreateManyInput[] {
  const sourcePdfSha256 = createHash('sha256').update(pdf).digest('hex');
  return records.map((record) => ({
    ...record,
    sourcePdfSha256,
    createdById: accountId,
    status: 'DRAFT',
  }));
}
