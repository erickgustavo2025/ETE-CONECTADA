import type { SessionRecord } from "./session-record";
// Mantém o papel já autorizado; novos papéis só são liberados por decisão da equipe.
export function canManageDeclarations(role: SessionRecord["role"]) {
  return role === "secretary";
}
