import type { Prisma, PrismaClient } from '../generated/prisma/client';

export class StudentDetailsError extends Error {}

const sources = [
  'SCHOOL_RECORD',
  'STUDENT_DECLARATION',
  'SECRETARY_CORRECTION',
] as const;
const states = new Set(
  'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(
    ' ',
  ),
);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function object(value: unknown, allowed: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  ) {
    throw new StudentDetailsError(
      'Confira os campos dos dados complementares.',
    );
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number) {
  if (
    typeof value !== 'string' ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  ) {
    throw new StudentDetailsError('Informe um texto válido para o campo.');
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > max) {
    throw new StudentDetailsError(
      'Confira o preenchimento e o tamanho do campo.',
    );
  }
  return normalized;
}

function source(value: unknown, allowDeclaration = true) {
  const found = sources.find((item) => item === value);
  if (!found || (!allowDeclaration && found === 'STUDENT_DECLARATION')) {
    throw new StudentDetailsError(
      'Informe uma origem permitida para os dados.',
    );
  }
  return found;
}

export function validateStudentDetailsPatch(value: unknown) {
  const body = object(value, ['parentage', 'socialName', 'birthplace']);
  const data: Pick<
    Prisma.StudentDetailsUncheckedCreateInput,
    | 'parentOne'
    | 'parentTwo'
    | 'parentageSource'
    | 'socialName'
    | 'socialNameSource'
    | 'birthCity'
    | 'birthState'
    | 'birthCountry'
    | 'birthplaceSource'
  > = {};
  if ('parentage' in body) {
    const group = object(body.parentage, ['parentOne', 'parentTwo', 'source']);
    data.parentOne = text(group.parentOne, 180);
    data.parentageSource = source(group.source, false);
    if ('parentTwo' in group) {
      if (
        group.parentTwo === null &&
        data.parentageSource !== 'SECRETARY_CORRECTION'
      )
        throw new StudentDetailsError(
          'A remoção de filiação exige correção explícita da secretaria.',
        );
      data.parentTwo =
        group.parentTwo === null ? null : text(group.parentTwo, 180);
    }
  }
  if ('socialName' in body) {
    const group = object(body.socialName, ['value', 'source']);
    data.socialName = group.value === null ? null : text(group.value, 180);
    data.socialNameSource = source(group.source);
  }
  if ('birthplace' in body) {
    const group = object(body.birthplace, [
      'city',
      'state',
      'country',
      'source',
    ]);
    const country = text(group.country, 2).toUpperCase();
    if (!/^[A-Z]{2}$/.test(country))
      throw new StudentDetailsError('Confira o país de nascimento.');
    const state =
      group.state == null ? null : text(group.state, 2).toUpperCase();
    if (
      (country === 'BR' && (!state || !states.has(state))) ||
      (country !== 'BR' && state !== null)
    ) {
      throw new StudentDetailsError('Confira a UF e o país de nascimento.');
    }
    data.birthCity = text(group.city, 120);
    data.birthState = state;
    data.birthCountry = country;
    data.birthplaceSource = source(group.source);
  }
  if (!Object.keys(data).length)
    throw new StudentDetailsError('Informe os dados que serão alterados.');
  return data;
}

// Chamador obtém actorId da sessão no servidor, nunca do formulário do aluno.
export async function updateStudentDetails(
  db: PrismaClient,
  actorId: string,
  studentId: string,
  value: unknown,
) {
  if (!uuid.test(actorId) || !uuid.test(studentId))
    throw new StudentDetailsError('Acesso não autorizado.');
  const data = validateStudentDetailsPatch(value);
  return db.$transaction(async (tx) => {
    // Bloqueia a conta durante a escrita para serializar revogação de papel/status.
    const authorized = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM accounts WHERE id = ${actorId}::uuid
      AND role = 'secretary' AND status = 'active' FOR UPDATE
    `;
    if (!authorized.length)
      throw new StudentDetailsError('Acesso não autorizado.');
    // Compartilha a ordem de locks com o pedido para não perder correção concorrente.
    const student = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM students WHERE id=${studentId}::uuid FOR UPDATE
    `;
    if (!student.length)
      throw new StudentDetailsError('Cadastro não disponível para alteração.');
    // Apenas campos presentes são atualizados; ausência no arquivo não apaga dados.
    return tx.studentDetails.upsert({
      where: { studentId },
      create: { studentId, ...data, updatedById: actorId },
      update: { ...data, updatedById: actorId },
    });
  });
}
