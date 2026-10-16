export function normalizeCpf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cpf = value.replace(/\D/g, '');
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return null;
  for (let position = 9; position < 11; position++) {
    const sum = [...cpf.slice(0, position)].reduce(
      (total, digit, index) => total + Number(digit) * (position + 1 - index),
      0,
    );
    const check = (sum * 10) % 11;
    if (Number(cpf[position]) !== (check === 10 ? 0 : check)) return null;
  }
  return cpf;
}

export function normalizeSchoolRegistration(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const registration = value.trim();
  return /^\d{7,8}$/.test(registration) ? registration : null;
}

export function validBirthDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) &&
    date.toISOString().slice(0, 10) === value &&
    date <= new Date()
  );
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : null;
}

// Compara o nome inteiro; não usa primeiro nome, aproximação ou ordem pai/mãe.
export function normalizeParentName(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length > 180 ||
    /[\p{Cc}\p{Cf}]/u.test(value)
  )
    return null;
  const name = value.trim().replace(/\s+/gu, ' ');
  if (
    !/^[\p{L}\p{M}][\p{L}\p{M}'’ -]*$/u.test(name) ||
    name.split(' ').length < 2 ||
    name.split(' ').some((word) => !/\p{L}/u.test(word))
  )
    return null;
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/’/g, "'")
    .toLowerCase();
}

export type RegisteredParentage = {
  parentOne: string | null;
  parentTwo: string | null;
  parentageSource: string | null;
};

export function matchesRegisteredParent(
  value: unknown,
  details: RegisteredParentage | null | undefined,
): boolean {
  const name = normalizeParentName(value);
  if (
    !name ||
    !details ||
    !['SCHOOL_RECORD', 'SECRETARY_CORRECTION'].includes(
      details.parentageSource ?? '',
    )
  )
    return false;
  return [details.parentOne, details.parentTwo].some(
    (parent) => normalizeParentName(parent) === name,
  );
}

export const registrationEnabled = process.env.NODE_ENV === 'development';

export function disabledResponse() {
  return Response.json(
    { error: 'O cadastro ainda não está disponível neste ambiente.' },
    { status: 503 },
  );
}

export function databaseErrorResponse() {
  return Response.json(
    {
      error: 'Não foi possível acessar o banco agora. Tente novamente depois.',
    },
    { status: 503 },
  );
}
