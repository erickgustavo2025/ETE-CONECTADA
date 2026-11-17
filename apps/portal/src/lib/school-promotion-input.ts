import { calendarDay } from './course-calendar-input';

export class SchoolPromotionError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type AcademicStage = {
  mode: 'INTEGRADO' | 'SUBSEQUENTE';
  courseLabel: 'ADM' | 'DS' | 'ENF';
  stage: number;
  periodLabel: string;
};
function academicStageDetails(source: AcademicStage) {
  const fail = () =>
    new SchoolPromotionError(
      'Confira a modalidade, o curso, a etapa e o período da turma.',
    );
  if (
    !['INTEGRADO', 'SUBSEQUENTE'].includes(source.mode) ||
    !['ADM', 'DS', 'ENF'].includes(source.courseLabel) ||
    !Number.isInteger(source.stage) ||
    source.stage < 1 ||
    (source.mode === 'INTEGRADO' && source.courseLabel === 'ENF')
  )
    throw fail();
  const limit =
    source.mode === 'SUBSEQUENTE' && source.courseLabel === 'ENF' ? 4 : 3;
  if (source.stage > limit) throw fail();
  const match = (
    source.mode === 'SUBSEQUENTE' ? /^(20\d{2})\.([12])$/ : /^(20\d{2})$/
  ).exec(source.periodLabel);
  if (!match) throw fail();
  return { limit, match };
}
/** A etapa vem do vínculo conferido, nunca da data do upload ou do índice da aba. */
export function nextAcademicStage(source: AcademicStage) {
  const { limit, match } = academicStageDetails(source);
  if (source.stage === limit)
    throw new SchoolPromotionError(
      'Esta turma está na etapa final. Não há próximo módulo ou série.',
    );
  const sourceYear = Number(match[1]);
  const secondSemester = source.mode === 'SUBSEQUENTE' && match[2] === '1';
  const schoolYear = secondSemester ? sourceYear : sourceYear + 1;
  if (schoolYear > 2099)
    throw new SchoolPromotionError('Confira o ano da próxima etapa.');
  return {
    stage: source.stage + 1,
    periodLabel:
      source.mode === 'SUBSEQUENTE'
        ? `${schoolYear}.${secondSemester ? 2 : 1}`
        : `${schoolYear}`,
    schoolYear,
    effectiveOn: `${schoolYear}-${secondSemester ? '08' : '02'}-01`,
  };
}
function validDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
    throw new SchoolPromotionError('Confira a data da passagem.');
  const parsed = new Date(day + 'T00:00:00Z');
  if (
    !Number.isFinite(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== day ||
    day < '1900-01-01' ||
    day > '2200-12-31'
  )
    throw new SchoolPromotionError('Confira a data da passagem.');
  return parsed;
}
export function promotionIsDue(effectiveOn: string, now = new Date()) {
  validDay(effectiveOn);
  if (!Number.isFinite(now.valueOf()))
    throw new SchoolPromotionError('Não foi possível conferir a data atual.');
  return calendarDay(now) >= effectiveOn;
}
export function dayBeforePromotion(effectiveOn: string) {
  const date = validDay(effectiveOn);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export type AutomaticPromotionSource = AcademicStage & {
  status: string;
  reviewedAt: Date | null;
  repetitionPending: boolean;
  progressionHeld: boolean;
};
type PromotionTarget = ReturnType<typeof nextAcademicStage>;
export type AutomaticPromotionDecision =
  | { kind: 'blocked'; reason: 'ENROLLMENT' | 'REPETITION' | 'HOLD' }
  | { kind: 'final-stage' }
  | { kind: 'wait' | 'advance'; next: PromotionTarget };

// Decisão pura: não autoriza emissão, não altera o banco nem conclui o curso.
// O serviço aplica uma vez sob trava e reconfere os dados antes de emitir o PDF.
export function automaticPromotionDecision(
  source: AutomaticPromotionSource,
  now = new Date(),
): AutomaticPromotionDecision {
  if (!Number.isFinite(now.valueOf()))
    throw new SchoolPromotionError('Não foi possível conferir a data atual.');
  if (
    source.status !== 'ACTIVE' ||
    !source.reviewedAt ||
    !Number.isFinite(source.reviewedAt.valueOf()) ||
    source.reviewedAt > now
  )
    return { kind: 'blocked', reason: 'ENROLLMENT' };
  const { limit } = academicStageDetails(source);
  if (source.repetitionPending)
    return { kind: 'blocked', reason: 'REPETITION' };
  if (source.progressionHeld) return { kind: 'blocked', reason: 'HOLD' };
  if (source.stage === limit) return { kind: 'final-stage' };
  const next = nextAcademicStage(source);
  return {
    kind: promotionIsDue(next.effectiveOn, now) ? 'advance' : 'wait',
    next,
  };
}
