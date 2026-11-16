import { RequestError } from './request-error';
import { uuid } from './sheet-import-input';
export type AcademicAction = 'ENABLE' | 'REPEAT' | 'REPEAT_PREVIOUS' | 'RESUME';
export type AcademicAdminInput =
  | { operation: 'detail'; enrollmentId: string; page: number }
  | {
      operation: 'change';
      enrollmentId: string;
      action: AcademicAction;
      version: string;
      requestKey: string;
      reason: string;
      nextClassName: string | null;
    };
export function readAcademicAdminInput(value: unknown): AcademicAdminInput {
  const bad = () =>
    new RequestError('Confira a matrícula, a ação e a confirmação.', 400);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad();
  const b = value as Record<string, unknown>,
    detail = b.operation === 'detail';
  const keys = detail
    ? ['operation', 'enrollmentId', 'page']
    : [
        'operation',
        'enrollmentId',
        'action',
        'version',
        'requestKey',
        'reason',
        'confirmed',
        'nextClassName',
      ];
  if (
    (!detail && b.operation !== 'change') ||
    Object.keys(b).some((k) => !keys.includes(k)) ||
    typeof b.enrollmentId !== 'string' ||
    !uuid.test(b.enrollmentId)
  )
    throw bad();
  if (detail) {
    const page = b.page ?? 1;
    if (
      typeof page !== 'number' ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 10000
    )
      throw bad();
    return { operation: 'detail', enrollmentId: b.enrollmentId, page };
  }
  const action = (
    ['ENABLE', 'REPEAT', 'REPEAT_PREVIOUS', 'RESUME'] as const
  ).find((a) => a === b.action);
  if (
    !action ||
    b.confirmed !== true ||
    typeof b.version !== 'string' ||
    !/^[a-f0-9]{64}$/.test(b.version) ||
    typeof b.requestKey !== 'string' ||
    !uuid.test(b.requestKey) ||
    typeof b.reason !== 'string' ||
    b.reason.length > 500 ||
    /[\p{Cc}\p{Cf}]/u.test(b.reason.replace(/[\r\n\t]/g, ''))
  )
    throw bad();
  const reason = b.reason.trim().replace(/\s+/g, ' ');
  const name =
    b.nextClassName === undefined ||
    b.nextClassName === null ||
    b.nextClassName === ''
      ? null
      : b.nextClassName;
  if (
    reason.length < 3 ||
    (name !== null && action !== 'ENABLE') ||
    (name !== null &&
      (typeof name !== 'string' ||
        name.length > 100 ||
        /[\p{Cc}\p{Cf}]/u.test(name) ||
        !name.trim()))
  )
    throw bad();
  return {
    operation: 'change',
    enrollmentId: b.enrollmentId,
    action,
    version: b.version,
    requestKey: b.requestKey,
    reason,
    nextClassName: typeof name === 'string' ? name.trim() : null,
  };
}
