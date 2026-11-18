export const auditCategories = [
  'ACESSO',
  'MATRICULA',
  'IMPORTACAO',
  'CALENDARIO',
  'DECLARACAO',
] as const;
export type AuditCategory = (typeof auditCategories)[number];

export type AuditFilters = {
  category: AuditCategory | null;
  student: string;
  from: string | null;
  until: string | null;
  page: number;
};

export type AuditEvent = {
  id: string;
  category: AuditCategory;
  action: string;
  at: Date;
  student: string | null;
  registration: string | null;
  subject: string | null;
  actor: string | null;
  reason: string | null;
  operation: string;
  automatic: boolean;
  confirmedBy: string | null;
  confirmedAt: string | null;
  correctsEventId: string | null;
};

const categoryIsValid = (value: string): value is AuditCategory =>
  auditCategories.some((category) => category === value);

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return (
    Number.isFinite(date.valueOf()) && date.toISOString().startsWith(value)
  );
}

const allowedFilters = ['categoria', 'aluno', 'inicio', 'fim', 'pagina'];

export function parseAuditFilters(
  search: Record<string, unknown>,
): AuditFilters | null {
  if (Object.keys(search).some((key) => !allowedFilters.includes(key)))
    return null;
  const {
    categoria = '',
    aluno = '',
    inicio = '',
    fim = '',
    pagina = '1',
  } = search;
  if (
    typeof categoria !== 'string' ||
    (categoria && !categoryIsValid(categoria))
  )
    return null;
  if (
    typeof aluno !== 'string' ||
    aluno.trim().length > 100 ||
    Array.from(aluno).some((char) => char < ' ' || char === '\u007f')
  )
    return null;
  if (typeof inicio !== 'string' || (inicio && !validDate(inicio))) return null;
  if (
    typeof fim !== 'string' ||
    (fim && !validDate(fim)) ||
    (inicio && fim && fim < inicio)
  )
    return null;
  if (typeof pagina !== 'string' || !/^[1-9][0-9]{0,2}$/.test(pagina))
    return null;
  return {
    category: categoria ? (categoria as AuditCategory) : null,
    student: aluno.trim(),
    from: inicio || null,
    until: fim || null,
    page: Number(pagina),
  };
}

export type AuditPage = {
  events: (Omit<AuditEvent, 'at'> & { at: string })[];
  hasNext: boolean;
};
