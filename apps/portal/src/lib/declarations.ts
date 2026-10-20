import type { PrismaClient } from '../generated/prisma/client';
import {
  EnrollmentValidityError,
  requireCurrentEnrollment,
} from './enrollment-validity';

export const studentDeclarationSelect = {
  id: true,
  fullName: true,
  schoolRegistration: true,
  cpf: true,
  birthDate: true,
  details: {
    select: {
      parentOne: true,
      parentTwo: true,
      socialName: true,
      birthCity: true,
      birthState: true,
      birthCountry: true,
      birthplaceSource: true,
    },
  },
  enrollments: {
    select: {
      id: true,
      mode: true,
      className: true,
      grade: true,
      courseLabel: true,
      schoolYear: true,
      status: true,
      periodLabel: true,
      validFrom: true,
      validUntil: true,
      reviewedAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

export async function declarationStudent(db: PrismaClient, studentId: string) {
  return db.student.findUnique({
    where: { id: studentId },
    select: studentDeclarationSelect,
  });
}

export type DeclarationStudent = NonNullable<
  Awaited<ReturnType<typeof declarationStudent>>
>;
type EnrollmentView = Pick<
  DeclarationStudent['enrollments'][number],
  | 'id'
  | 'mode'
  | 'className'
  | 'grade'
  | 'courseLabel'
  | 'schoolYear'
  | 'periodLabel'
>;
export type StudentView = Omit<
  DeclarationStudent,
  'birthDate' | 'enrollments'
> & {
  birthDate: string;
  enrollments: EnrollmentView[];
};
export function studentView(student: DeclarationStudent): StudentView {
  return {
    ...student,
    birthDate: student.birthDate.toISOString().slice(0, 10),
    enrollments: student.enrollments.map(
      ({
        id,
        mode,
        className,
        grade,
        courseLabel,
        schoolYear,
        periodLabel,
      }) => ({
        id,
        mode,
        className,
        grade,
        courseLabel,
        schoolYear,
        periodLabel,
      }),
    ),
  };
}

export type DeclarationFields = {
  enrollmentId: string;
  naturality: string;
  parentOne: string;
  parentTwo: string;
  socialName: string;
  courseName: string;
  schoolPeriod: string;
  schedule: string;
  secretaryName: string;
  secretaryRegistration: string;
  directorName: string;
  directorRegistration: string;
  reviewed: boolean;
  includeFrequency?: boolean;
  frequencyPercent?: string;
  frequencyStart?: string;
  frequencyEnd?: string;
};

export function declarationDefaults(
  student: StudentView,
): Partial<DeclarationFields> {
  const enrollment = student.enrollments[0];
  const details = student.details;
  const courseNames: Record<string, string> = {
    ADM: 'Administração',
    DS: 'Desenvolvimento de Sistemas',
    ENF: 'Enfermagem',
  };
  return {
    enrollmentId: enrollment?.id ?? '',
    parentOne: details?.parentOne ?? '',
    parentTwo: details?.parentTwo ?? '',
    socialName: details?.socialName ?? '',
    naturality: details?.birthCity
      ? `${details.birthCity}${details.birthState ? `/${details.birthState}` : details.birthCountry ? ` (${details.birthCountry})` : ''}`
      : '',
    courseName: Object.hasOwn(courseNames, enrollment?.courseLabel ?? '')
      ? courseNames[enrollment!.courseLabel]
      : (enrollment?.courseLabel ?? ''),
    schoolPeriod:
      enrollment?.periodLabel ?? enrollment?.schoolYear?.toString() ?? '',
  };
}

export class DeclarationValidationError extends Error {
  itemIndex?: number;
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

export function validateDeclarationFields(value: unknown): DeclarationFields {
  if (!value || typeof value !== 'object')
    throw new DeclarationValidationError('Confira os dados da declaração.');
  const body = value as Record<string, unknown>;
  const text = (key: string, label: string, required = false, max = 180) => {
    const value =
      typeof body[key] === 'string'
        ? body[key].trim().replace(/\s+/g, ' ')
        : '';
    if (required && !value)
      throw new DeclarationValidationError(`Preencha ${label}.`, key);
    if (
      value.length > max ||
      Array.from(value).some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      throw new DeclarationValidationError(
        `Confira ${label}; use no máximo ${max} caracteres.`,
        key,
      );
    return value;
  };
  const enrollmentId = text(
    'enrollmentId',
    'a matrícula selecionada',
    true,
    36,
  );
  if (!/^[0-9a-f-]{36}$/i.test(enrollmentId))
    throw new DeclarationValidationError('Selecione uma matrícula válida.');
  const fields: DeclarationFields = {
    enrollmentId,
    naturality: text('naturality', 'a naturalidade (município/UF)', true, 120),
    parentOne: text('parentOne', 'a filiação registrada', true),
    parentTwo: text('parentTwo', 'a segunda filiação'),
    socialName: text('socialName', 'o nome social'),
    courseName: text('courseName', 'o nome oficial do curso', true, 120),
    schoolPeriod: text('schoolPeriod', 'o período letivo', true, 60),
    schedule: text('schedule', 'os dias e horários', false, 120),
    secretaryName: text(
      'secretaryName',
      'o nome de quem assina pela secretaria',
    ),
    secretaryRegistration: text(
      'secretaryRegistration',
      'a identificação da secretaria',
      false,
      60,
    ),
    directorName: text('directorName', 'o nome de quem assina pela gestão'),
    directorRegistration: text(
      'directorRegistration',
      'a identificação da gestão',
      false,
      60,
    ),
    reviewed: body.reviewed === true,
    includeFrequency: body.includeFrequency === true,
    frequencyPercent: text(
      'frequencyPercent',
      'o percentual de frequência',
      body.includeFrequency === true,
      6,
    ),
    frequencyStart: text(
      'frequencyStart',
      'o início da apuração',
      body.includeFrequency === true,
      10,
    ),
    frequencyEnd: text(
      'frequencyEnd',
      'o fim da apuração',
      body.includeFrequency === true,
      10,
    ),
  };
  if (fields.includeFrequency) {
    const percent = fields.frequencyPercent!.replace(',', '.');
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(percent) || Number(percent) > 100)
      throw new DeclarationValidationError(
        'Informe uma frequência entre 0 e 100%, com até duas casas decimais.',
        'frequencyPercent',
      );
    for (const key of ['frequencyStart', 'frequencyEnd'] as const) {
      const date = fields[key]!;
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date
      )
        throw new DeclarationValidationError(
          'Informe uma data de apuração válida.',
          key,
        );
    }
    if (fields.frequencyEnd! < fields.frequencyStart!)
      throw new DeclarationValidationError(
        'O fim da apuração deve ser igual ou posterior ao início.',
        'frequencyEnd',
      );
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Recife',
    }).format(new Date());
    if (fields.frequencyEnd! > today)
      throw new DeclarationValidationError(
        'A frequência deve se referir a um período já apurado.',
        'frequencyEnd',
      );
    fields.frequencyPercent = percent;
  }
  if (!fields.reviewed)
    throw new DeclarationValidationError(
      'Confira os dados escolares e marque a confirmação antes de gerar.',
      'reviewed',
    );
  return fields;
}

export function declarationBody(
  student: DeclarationStudent,
  fields: DeclarationFields,
) {
  const enrollment = student.enrollments.find(
    (e) => e.id === fields.enrollmentId,
  );
  if (!enrollment)
    throw new DeclarationValidationError(
      'Esta matrícula não pertence ao aluno selecionado.',
    );
  if (enrollment.mode !== 'INTEGRADO')
    throw new DeclarationValidationError(
      'O modelo do subsequente ainda precisa ser confirmado pela escola.',
    );
  try {
    requireCurrentEnrollment(enrollment, fields.schoolPeriod);
  } catch (error) {
    if (error instanceof EnrollmentValidityError)
      throw new DeclarationValidationError(error.message, error.field);
    throw error;
  }
  if (!student.fullName || !enrollment.grade)
    throw new DeclarationValidationError(
      'O cadastro não contém nome e série completos. Procure a secretaria.',
    );
  const birth = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
    student.birthDate,
  );
  const cpf = student.cpf?.replace(
    /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
    '$1.$2.$3-$4',
  );
  // Regra fixa confirmada pela secretaria; não é cálculo de presença individual.
  const frequency = ' A frequência registrada no período letivo é de 100%.';
  return `Declaramos, para os devidos fins de comprovação, que ${student.fullName}, nascido(a) em ${birth}, natural de ${fields.naturality}, filho(a) de ${fields.parentOne}${fields.parentTwo ? ` e ${fields.parentTwo}` : ''}${cpf ? `, portador(a) do CPF ${cpf}` : ''}, está regularmente matriculado(a) no ${enrollment.grade}º ano do Ensino Médio Integrado ao Curso Técnico em ${fields.courseName}, no período letivo ${fields.schoolPeriod}, nesta unidade escolar.${fields.schedule ? ` As atividades escolares ocorrem ${fields.schedule}.` : ''}${frequency}`;
}
