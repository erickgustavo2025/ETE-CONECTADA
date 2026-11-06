/** Metadados do cabeçalho escolar; nunca inferir módulo pela posição da aba. */
type Course = 'ADM' | 'DS' | 'ENF';
type Mode = 'INTEGRADO' | 'SUBSEQUENTE';
export type SubsequentReference = {
  entryPeriod: string;
  completionPeriod: string;
  startsOn: string;
  endsOn: string;
  totalModules: number;
};
const invalid = () =>
  new Error(
    'Confira a turma, o módulo ou série e o período no cabeçalho da planilha.',
  );
const normalized = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[ºª]/g, '')
    .trim()
    .toUpperCase();
function semesterIndex(period: string) {
  const match = /^(20\d{2})\.([12])$/.exec(period);
  if (!match) throw invalid();
  return Number(match[1]) * 2 + Number(match[2]) - 1;
}
function semesterLabel(index: number) {
  const year = Math.floor(index / 2);
  if (year < 2000 || year > 2099) throw invalid();
  return `${year}.${(index % 2) + 1}`;
}
export function estimateSubsequentReference(
  course: Course,
  stage: number,
  period: string,
): SubsequentReference {
  const totalModules = course === 'ENF' ? 4 : 3;
  if (
    !['ADM', 'DS', 'ENF'].includes(course) ||
    !Number.isInteger(stage) ||
    stage < 1 ||
    stage > totalModules
  )
    throw invalid();
  const entry = semesterIndex(period) - stage + 1;
  const completion = entry + totalModules - 1;
  return {
    entryPeriod: semesterLabel(entry),
    completionPeriod: semesterLabel(completion),
    startsOn: `${Math.floor(entry / 2)}-${entry % 2 ? '08' : '02'}-01`,
    endsOn: `${Math.floor(completion / 2)}-${completion % 2 ? '12-31' : '07-31'}`,
    totalModules,
  };
}
export function readSchoolClassMetadata(
  rows: string[][],
  mode: Mode,
  course: Course,
  stage: number,
) {
  const periodMatch = / - (20\d{2})(?:\s*\/\s*([12]))?\s*$/.exec(
    rows[1]?.[0] ?? '',
  );
  const classMatch =
    /^([1-4])\s*(MODULO|ANO|SERIE)\s+-\s+[A-Z]+\s+-\s+([A-Z][A-Z0-9-]{2,39})$/.exec(
      normalized(rows[3]?.[0] ?? ''),
    );
  if (
    !periodMatch ||
    !classMatch ||
    Number(classMatch[1]) !== stage ||
    (classMatch[2] === 'MODULO') !== (mode === 'SUBSEQUENTE') ||
    (mode === 'INTEGRADO' && (stage > 3 || course === 'ENF'))
  )
    throw invalid();
  const schoolYear = Number(periodMatch[1]);
  if ((mode === 'SUBSEQUENTE') !== Boolean(periodMatch[2])) throw invalid();
  const periodLabel = periodMatch[2]
    ? `${schoolYear}.${periodMatch[2]}`
    : `${schoolYear}`;
  return {
    classCode: classMatch[3],
    periodLabel,
    schoolYear,
    reference:
      mode === 'SUBSEQUENTE'
        ? estimateSubsequentReference(course, stage, periodLabel)
        : null,
  };
}

export function schoolClassSchedule(
  course: Course,
  stage: number,
  period: string,
  classCode: string,
) {
  const reference = estimateSubsequentReference(course, stage, period);
  const first = semesterIndex(reference.entryPeriod);
  return {
    label: `${classCode} · ingresso estimado ${reference.entryPeriod}`,
    courseLabel: course,
    startsOn: reference.startsOn,
    endsOn: reference.endsOn,
    modules: Array.from({ length: reference.totalModules }, (_, index) => {
      const current = first + index;
      return {
        number: index + 1,
        startsOn: `${Math.floor(current / 2)}-${current % 2 ? '08' : '02'}-01`,
        endsOn: `${Math.floor(current / 2)}-${current % 2 ? '12-31' : '07-31'}`,
        periodLabel: semesterLabel(current),
      };
    }),
  };
}
