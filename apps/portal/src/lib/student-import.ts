import { normalizeSchoolRegistration } from './registration';

type BackupStudent = {
  sourceId: string;
  schoolRegistration: string;
  fullName: string;
  birthDate: Date;
  className: string;
  grade: number;
  courseLabel: string;
};

export class StudentImportError extends Error {}

// A lista branca exclui senhas, e-mails, papéis, fotos e dados da gamificação.
export function parseStudentBackup(value: unknown): BackupStudent[] {
  if (!Array.isArray(value) || !value.length || value.length > 10000)
    throw new StudentImportError('Lista de alunos inválida.');
  const registrations = new Set<string>();
  const sources = new Set<string>();
  return value.map((item: unknown, index) => {
    const fail = () => {
      throw new StudentImportError(
        `Registro ${index + 1} inválido; confira nome, matrícula, nascimento e turma no arquivo de origem.`,
      );
    };
    if (!item || typeof item !== 'object') return fail();
    const row = item as Record<string, unknown>;
    const id =
      row._id && typeof row._id === 'object'
        ? (row._id as Record<string, unknown>).$oid
        : undefined;
    const name =
      typeof row.nome === 'string' ? row.nome.trim().replace(/\s+/g, ' ') : '';
    const registration =
      typeof row.matricula === 'string' ? row.matricula.trim() : '';
    const turma =
      typeof row.turma === 'string' ? row.turma.trim().toUpperCase() : '';
    const classroom = /^([123])([A-Z]) (ADM|DS)$/.exec(turma);
    const date =
      typeof row.dataNascimento === 'string'
        ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(row.dataNascimento)
        : null;
    if (
      typeof id !== 'string' ||
      !/^[a-f0-9]{24}$/i.test(id) ||
      !name ||
      name.length > 180 ||
      !normalizeSchoolRegistration(registration) ||
      !classroom ||
      !date
    )
      return fail();
    const iso = `${date[3]}-${date[2]}-${date[1]}`;
    const birthDate = new Date(`${iso}T00:00:00Z`);
    if (
      !Number.isFinite(birthDate.valueOf()) ||
      birthDate.toISOString().slice(0, 10) !== iso ||
      birthDate > new Date()
    )
      return fail();
    const sourceId = `backup-alunos:${id.toLowerCase()}`;
    if (registrations.has(registration) || sources.has(sourceId))
      throw new StudentImportError(
        'O arquivo contém matrículas ou identificadores repetidos. Nenhum dado foi importado.',
      );
    registrations.add(registration);
    sources.add(sourceId);
    return {
      sourceId,
      schoolRegistration: registration,
      fullName: name,
      birthDate,
      className: turma,
      grade: Number(classroom[1]),
      courseLabel: classroom[3],
    };
  });
}
