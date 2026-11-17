import { RequestError } from './request-error';
import { uuid } from './sheet-import-input';
export type CompletionContext = {
  mode: 'INTEGRADO' | 'SUBSEQUENTE';
  courseLabel: 'ADM' | 'DS' | 'ENF';
  className: string;
  periodLabel: string;
};
export type CompletionSelection = { enrollmentId: string; version: string };
type Choice = {
  context: CompletionContext;
  selections: CompletionSelection[];
  reason: string;
};
export type CompletionInput =
  | { operation: 'candidates'; context: CompletionContext; page: number }
  | (Choice & { operation: 'preview' })
  | (Choice & {
      operation: 'confirm';
      requestKey: string;
      previewVersion: string;
    });
const bad = () =>
  new RequestError(
    'Confira a turma, os concluintes selecionados e a confirmação.',
    400,
  );
function object(v: unknown) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw bad();
  return v as Record<string, unknown>;
}
function only(v: Record<string, unknown>, keys: string[]) {
  if (Object.keys(v).some((k) => !keys.includes(k))) throw bad();
}
function text(v: unknown, max: number) {
  if (typeof v !== 'string' || v.length > max || /[\p{Cc}\p{Cf}]/u.test(v))
    throw bad();
  const s = v.trim();
  if (!s) throw bad();
  return s;
}
export function readCompletionInput(value: unknown): CompletionInput {
  const b = object(value),
    c = object(b.context);
  only(c, ['mode', 'courseLabel', 'className', 'periodLabel']);
  if (
    !['INTEGRADO', 'SUBSEQUENTE'].includes(String(c.mode)) ||
    !['ADM', 'DS', 'ENF'].includes(String(c.courseLabel)) ||
    (c.mode === 'INTEGRADO' && c.courseLabel === 'ENF')
  )
    throw bad();
  const context: CompletionContext = {
    mode: c.mode as CompletionContext['mode'],
    courseLabel: c.courseLabel as CompletionContext['courseLabel'],
    className: text(c.className, 120),
    periodLabel: text(c.periodLabel, 60),
  };
  if (
    !(context.mode === 'INTEGRADO' ? /^20\d{2}$/ : /^20\d{2}\.[12]$/).test(
      context.periodLabel,
    )
  )
    throw bad();
  if (b.operation === 'candidates') {
    only(b, ['operation', 'context', 'page']);
    const page = b.page ?? 1;
    if (
      typeof page !== 'number' ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 10000
    )
      throw bad();
    return { operation: 'candidates', context, page };
  }
  if (b.operation !== 'preview' && b.operation !== 'confirm') throw bad();
  only(b, [
    'operation',
    'context',
    'selections',
    'reason',
    ...(b.operation === 'confirm'
      ? ['requestKey', 'previewVersion', 'confirmed']
      : []),
  ]);
  if (
    !Array.isArray(b.selections) ||
    !b.selections.length ||
    b.selections.length > 100 ||
    typeof b.reason !== 'string' ||
    b.reason.length > 500 ||
    /[\p{Cc}\p{Cf}]/u.test(b.reason.replace(/[\r\n\t]/g, ''))
  )
    throw bad();
  const reason = b.reason.trim().replace(/\s+/g, ' ');
  if (reason.length < 3) throw bad();
  const seen = new Set<string>();
  const selections = b.selections
    .map((v) => {
      const s = object(v);
      only(s, ['enrollmentId', 'version']);
      if (
        typeof s.enrollmentId !== 'string' ||
        !uuid.test(s.enrollmentId) ||
        typeof s.version !== 'string' ||
        !/^[a-f0-9]{64}$/.test(s.version)
      )
        throw bad();
      const enrollmentId = s.enrollmentId.toLowerCase();
      if (seen.has(enrollmentId)) throw bad();
      seen.add(enrollmentId);
      return { enrollmentId, version: s.version };
    })
    .sort((a, b) => a.enrollmentId.localeCompare(b.enrollmentId));
  if (b.operation === 'preview')
    return { operation: 'preview', context, selections, reason };
  if (
    b.confirmed !== true ||
    typeof b.requestKey !== 'string' ||
    !uuid.test(b.requestKey) ||
    typeof b.previewVersion !== 'string' ||
    !/^[a-f0-9]{64}$/.test(b.previewVersion)
  )
    throw bad();
  return {
    operation: 'confirm',
    context,
    selections,
    reason,
    requestKey: b.requestKey.toLowerCase(),
    previewVersion: b.previewVersion,
  };
}
