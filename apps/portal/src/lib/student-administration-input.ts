import { validRequestId, RequestError } from './declaration-requests';
export type StudentAccessKind = 'LOGIN' | 'ISSUANCE';
export type StudentSearch = {
  operation: 'search';
  query: string;
  mode: '' | 'INTEGRADO' | 'SUBSEQUENTE';
  className: string;
  periodLabel?: string | null;
  courseLabel?: string;
  status: '' | 'LOGIN_BLOCKED' | 'ISSUANCE_BLOCKED' | 'UNBLOCKED';
  page: number;
};
export type StudentAccessInput = {
  operation: 'change';
  studentId: string;
  requestKey: string;
  kind: StudentAccessKind;
  blocked: boolean;
  revision: number;
  reason: string;
};
export type StudentAdminInput =
  | StudentSearch
  | StudentAccessInput
  | { operation: 'detail'; studentId: string; page: number };
const invalid = () =>
  new RequestError('Confira os dados e tente novamente.', 400);
export function readStudentAdminInput(value: unknown): StudentAdminInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid();
  const b = value as Record<string, unknown>;
  const keys =
    b.operation === 'search'
      ? [
          'operation',
          'query',
          'mode',
          'className',
          'periodLabel',
          'courseLabel',
          'status',
          'page',
        ]
      : b.operation === 'detail'
        ? ['operation', 'studentId', 'page']
        : b.operation === 'change'
          ? [
              'operation',
              'studentId',
              'kind',
              'blocked',
              'revision',
              'reason',
              'requestKey',
              'confirmed',
            ]
          : [];
  if (!keys.length || Object.keys(b).some((k) => !keys.includes(k)))
    throw invalid();
  const text = (key: string, max: number) => {
    const v = b[key] ?? '';
    if (
      typeof v !== 'string' ||
      v.length > max ||
      Array.from(v).some((c) => {
        const code = c.codePointAt(0)!;
        return (
          code === 127 ||
          (code < 32 && (key !== 'reason' || ![9, 10, 13].includes(code)))
        );
      })
    )
      throw invalid();
    return v.trim();
  };
  const page = b.page ?? 1;
  if (
    typeof page !== 'number' ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 10000
  )
    throw invalid();
  if (b.operation === 'search') {
    const query = text('query', 180),
      mode = text('mode', 20),
      className = text('className', 120),
      status = text('status', 24);
    if (query && query.length < 2)
      throw new RequestError('Digite pelo menos duas letras ou números.', 400);
    if (
      !['', 'INTEGRADO', 'SUBSEQUENTE'].includes(mode) ||
      !['', 'LOGIN_BLOCKED', 'ISSUANCE_BLOCKED', 'UNBLOCKED'].includes(status)
    )
      throw invalid();
    return {
      operation: 'search',
      query,
      mode: mode as StudentSearch['mode'],
      className,
      ...(b.periodLabel === undefined
        ? {}
        : {
            periodLabel:
              b.periodLabel === null ? null : text('periodLabel', 60),
          }),
      ...(b.courseLabel === undefined
        ? {}
        : { courseLabel: text('courseLabel', 120) }),
      status: status as StudentSearch['status'],
      page,
    };
  }
  if (!validRequestId(b.studentId)) throw invalid();
  const studentId = String(b.studentId).toLowerCase();
  if (b.operation === 'detail') return { operation: 'detail', studentId, page };
  if (
    !validRequestId(b.requestKey) ||
    !['LOGIN', 'ISSUANCE'].includes(String(b.kind)) ||
    typeof b.blocked !== 'boolean' ||
    b.confirmed !== true ||
    typeof b.revision !== 'number' ||
    !Number.isSafeInteger(b.revision) ||
    b.revision < 0 ||
    b.revision >= 2147483647
  )
    throw invalid();
  const reason = text('reason', 500).replace(/\s+/g, ' ');
  if (reason.length < 3)
    throw new RequestError(
      'Explique o motivo usando de 3 a 500 caracteres.',
      400,
    );
  return {
    operation: 'change',
    studentId,
    requestKey: String(b.requestKey).toLowerCase(),
    kind: b.kind as StudentAccessKind,
    blocked: b.blocked,
    revision: b.revision,
    reason,
  };
}
