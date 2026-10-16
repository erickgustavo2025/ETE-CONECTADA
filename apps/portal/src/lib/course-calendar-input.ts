export class CalendarError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const COURSE_MODULES = { ADM: 3, DS: 3, ENF: 4 } as const;
export type CalendarModule = {
  number: number;
  startsOn: string;
  endsOn: string;
  periodLabel: string;
};
export type CalendarDraft = {
  label: string;
  courseLabel: keyof typeof COURSE_MODULES;
  startsOn: string;
  endsOn: string;
  modules: CalendarModule[];
};
function object(value: unknown, keys: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new CalendarError('Confira os campos do calendário.');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number) {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    !value.trim() ||
    /[\p{Cc}\p{Cf}]/u.test(value)
  )
    throw new CalendarError('Confira os textos e limites do calendário.');
  return value.trim().replace(/\s+/g, ' ');
}
function date(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new CalendarError('Informe uma data válida no calendário.');
  const parsed = new Date(value + 'T00:00:00Z');
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value ||
    value < '1900-01-01' ||
    value > '2200-12-31'
  )
    throw new CalendarError('Informe uma data válida no calendário.');
  return value;
}
export function readCalendarDraft(value: unknown): CalendarDraft {
  const input = object(value, [
    'label',
    'courseLabel',
    'startsOn',
    'endsOn',
    'modules',
  ]);
  const courseLabel = (['ADM', 'DS', 'ENF'] as const).find(
    (course) => course === input.courseLabel,
  );
  if (!courseLabel) throw new CalendarError('Selecione ADM, DS ou Enfermagem.');
  const startsOn = date(input.startsOn),
    endsOn = date(input.endsOn);
  if (startsOn > endsOn)
    throw new CalendarError(
      'O início do curso deve vir antes da conclusão prevista.',
    );
  if (
    !Array.isArray(input.modules) ||
    input.modules.length !== COURSE_MODULES[courseLabel]
  )
    throw new CalendarError(
      'ADM e DS têm três módulos; Enfermagem tem quatro.',
    );
  const modules = input.modules.map((value, index) => {
    const item = object(value, ['number', 'startsOn', 'endsOn', 'periodLabel']);
    if (item.number !== index + 1)
      throw new CalendarError(
        'Informe todos os módulos em ordem, sem repetição.',
      );
    const start = date(item.startsOn),
      end = date(item.endsOn);
    if (start > end || start < startsOn || end > endsOn)
      throw new CalendarError(
        'As datas do módulo precisam estar dentro do curso.',
      );
    return {
      number: index + 1,
      startsOn: start,
      endsOn: end,
      periodLabel: text(item.periodLabel, 60),
    };
  });
  for (let i = 1; i < modules.length; i++)
    if (modules[i].startsOn <= modules[i - 1].endsOn)
      throw new CalendarError(
        'As datas de módulos diferentes não podem se sobrepor.',
      );
  return {
    label: text(input.label, 120),
    courseLabel,
    startsOn,
    endsOn,
    modules,
  };
}
export function calendarDay(now: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Recife',
  }).format(now);
}
export function moduleOnDate(
  calendar: CalendarDraft,
  now = new Date(),
): CalendarModule | null {
  const day = calendarDay(now);
  return (
    [...calendar.modules].reverse().find((module) => module.startsOn <= day) ??
    null
  );
}
export function calendarEnded(calendar: CalendarDraft, now = new Date()) {
  return calendarDay(now) > calendar.endsOn;
}

export function progressionDecision(
  row: {
    mode: string;
    status: string;
    offeringId: string | null;
    progressionHeld: boolean;
    moduleNumber: number | null;
    calendarModule: number | null;
  },
  calendar: CalendarDraft,
  now = new Date(),
): { kind: 'none' | 'hold' } | { kind: 'advance'; module: CalendarModule } {
  if (
    row.mode !== 'SUBSEQUENTE' ||
    row.status !== 'ACTIVE' ||
    !row.offeringId ||
    row.progressionHeld ||
    !row.calendarModule
  )
    return { kind: 'none' };
  if (row.moduleNumber !== row.calendarModule) return { kind: 'hold' };
  const module = moduleOnDate(calendar, now);
  return module && module.number > row.calendarModule
    ? { kind: 'advance', module }
    : { kind: 'none' };
}
