export type PublicDocumentState = 'VALID' | 'CANCELLED' | 'SUPERSEDED';
export type PublicVerification = {
  code: string;
  state: PublicDocumentState;
  checkedAt: string;
  testOnly: true;
  pdfSha256: string;
  nameMatches: boolean | null;
  document: {
    nameMasked: string;
    issuer: string;
    type: string;
    issuedAt: string;
    course: string;
    mode: string;
    level: string;
    period: string;
  };
};
export function isPublicVerification(
  value: unknown,
): value is PublicVerification {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>,
    d = v.document;
  return (
    typeof v.code === 'string' &&
    /^[\w-]{43}$/.test(v.code) &&
    ['VALID', 'CANCELLED', 'SUPERSEDED'].includes(String(v.state)) &&
    v.testOnly === true &&
    typeof v.checkedAt === 'string' &&
    Number.isFinite(Date.parse(v.checkedAt)) &&
    typeof v.pdfSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(v.pdfSha256) &&
    (v.nameMatches === null || typeof v.nameMatches === 'boolean') &&
    !!d &&
    typeof d === 'object' &&
    !Array.isArray(d) &&
    [
      'nameMasked',
      'issuer',
      'type',
      'issuedAt',
      'course',
      'mode',
      'level',
      'period',
    ].every(
      (k) =>
        typeof (d as Record<string, unknown>)[k] === 'string' &&
        !!(d as Record<string, unknown>)[k],
    ) &&
    Number.isFinite(Date.parse(String((d as Record<string, unknown>).issuedAt)))
  );
}
