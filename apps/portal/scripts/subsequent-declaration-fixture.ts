import { randomUUID } from 'node:crypto';
import type { DeclarationStudent } from '../src/lib/declarations';
import { calendarDay } from '../src/lib/course-calendar-input';
export function subsequentFixture(
  courseLabel: 'ADM' | 'DS' | 'ENF' = 'DS',
  moduleNumber = 1,
) {
  const count = courseLabel === 'ENF' ? 4 : 3;
  const [year, month] = calendarDay(new Date()).split('-').map(Number);
  const currentMonth = year * 12 + (month <= 6 ? 0 : 6);
  const first = currentMonth - (moduleNumber - 1) * 6;
  const day = (index: number, end = false) =>
    new Date(
      Date.UTC(
        Math.floor(index / 12),
        (index % 12) + (end ? 6 : 0),
        end ? 0 : 1,
      ),
    )
      .toISOString()
      .slice(0, 10);
  const modules = Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    startsOn: day(first + i * 6),
    endsOn: day(first + i * 6, true),
    periodLabel: `${Math.floor((first + i * 6) / 12)}.${(first + i * 6) % 12 === 0 ? 1 : 2}`,
  }));
  const current = modules[moduleNumber - 1];
  const offeringId = randomUUID();
  const schedule = {
    label: 'Turma fictícia com ingresso conferido',
    courseLabel,
    startsOn: modules[0].startsOn,
    endsOn: modules[count - 1].endsOn,
    modules,
  };
  const enrollment = {
    id: randomUUID(),
    mode: 'SUBSEQUENTE' as const,
    className: 'Turma subsequente fictícia',
    grade: null,
    courseLabel,
    schoolYear: null,
    status: 'ACTIVE' as const,
    periodLabel: current.periodLabel,
    validFrom: new Date(current.startsOn + 'T00:00:00Z'),
    validUntil: new Date(current.endsOn + 'T00:00:00Z'),
    reviewedAt: new Date('2000-01-01T00:00:00Z'),
    moduleNumber,
    calendarModule: moduleNumber,
    calendarRevision: 1,
    offeringId,
    offering: { courseLabel, calendars: [{ revision: 1, schedule }] },
  };
  const student = {
    id: randomUUID(),
    fullName: 'Estudante fictício do subsequente',
    birthDate: new Date('2000-01-01T00:00:00Z'),
    cpf: null,
    schoolRegistration: '0000001',
    details: null,
    enrollments: [enrollment],
  } satisfies DeclarationStudent;
  return { student, enrollment, schedule };
}
