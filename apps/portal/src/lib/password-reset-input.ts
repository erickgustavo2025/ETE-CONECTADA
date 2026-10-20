import { validAccessPassword } from './access-input';

export const recoveryReceipt =
  'Se houver uma conta ativa com esse e-mail, enviaremos um link para redefinir a senha. Confira também o spam.';
export const resetLifetimeMs = 30 * 60_000;

export function validResetToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export type ResetProblem = 'invalid' | 'password' | 'mismatch';
export function resetProblem(input: {
  token: unknown;
  password: unknown;
  confirmPassword: unknown;
}): ResetProblem | null {
  if (!validResetToken(input.token)) return 'invalid';
  if (
    !validAccessPassword(input.password) ||
    !validAccessPassword(input.confirmPassword)
  )
    return 'password';
  return input.password === input.confirmPassword ? null : 'mismatch';
}

export { configuredOrigin as resetOrigin } from './portal-origin';
