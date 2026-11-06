import { createHash, timingSafeEqual } from 'node:crypto';
import {
  configuredOrigin,
  developmentOrigin,
} from '../../../../shared/request-origin';

export class VerificationInputError extends Error {
  constructor(
    message: string,
    public field = 'code',
  ) {
    super(message);
  }
}
export const validDocumentCode = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export function readPublicVerificationQuery(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new VerificationInputError('Confira o código do documento.');
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).some((k) => !['code', 'fullName'].includes(k)) ||
    !validDocumentCode(data.code)
  )
    throw new VerificationInputError('Confira o código do documento.');
  let fullName: string | null = null;
  if (data.fullName !== undefined) {
    if (
      typeof data.fullName !== 'string' ||
      data.fullName.trim().length < 2 ||
      data.fullName.length > 180 ||
      Array.from(data.fullName).some(
        (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
      )
    )
      throw new VerificationInputError(
        'Informe o nome completo como aparece na declaração.',
        'fullName',
      );
    fullName = data.fullName.trim();
  }
  return { code: data.code, fullName };
}
const normalizedName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
export function documentNameMatches(expected: string, value: string) {
  const digest = (text: string) =>
    createHash('sha256').update(normalizedName(text)).digest();
  return timingSafeEqual(digest(expected), digest(value));
}
export function maskDocumentName(name: string) {
  const words = name.normalize('NFC').trim().split(/\s+/);
  const mask = (s: string) =>
    Array.from(s)
      .slice(0, Math.min(3, Math.max(0, Array.from(s).length - 1)))
      .join('') + '***';
  return mask(words[0]) + (words.length > 1 ? ' ' + mask(words.at(-1)!) : '');
}
// Só configuração explícita. Host e forwarded nunca definem o destino do QR.
export function verificationLink(
  code: string,
  value = process.env.PORTAL_PUBLIC_URL,
  environment = process.env.NODE_ENV,
) {
  const origin =
    configuredOrigin(value) ??
    (['development', 'test'].includes(environment ?? '') &&
    typeof value === 'string'
      ? developmentOrigin(value, process.env.NEXT_PUBLIC_LAN_HOST)
      : null);
  if (
    !validDocumentCode(code) ||
    !origin ||
    (!['development', 'test'].includes(environment ?? '') &&
      !origin.startsWith('https://'))
  )
    throw new VerificationInputError(
      'Configure o endereço público de verificação antes de emitir.',
    );
  const url = origin + '/validar/' + code;
  if (Buffer.byteLength(url, 'utf8') > 150)
    throw new VerificationInputError(
      'O endereço de verificação excede o espaço de leitura do QR.',
    );
  return url;
}
