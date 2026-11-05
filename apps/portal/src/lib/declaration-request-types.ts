export const requestStatusLabels = {
  REQUESTED: 'Solicitada',
  IN_PREPARATION: 'Em preparação',
  READY_FOR_PICKUP: 'Pronta para retirada',
  AVAILABLE: 'Disponível para baixar',
} as const;
export type RequestStatus = keyof typeof requestStatusLabels;
export type RequestSummary = {
  id: string;
  status: RequestStatus;
  createdAt: string;
  generatedAt: string | null;
  readyAt: string | null;
  enrollmentId: string;
  className: string;
  document?: { id: string; state: string };
};
export function isRequestSummary(value: unknown): value is RequestSummary {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const uuid = (v: unknown) =>
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const date = (v: unknown) =>
    typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));
  const document = row.document as Record<string, unknown> | undefined;
  return (
    uuid(row.id) &&
    uuid(row.enrollmentId) &&
    typeof row.status === 'string' &&
    Object.hasOwn(requestStatusLabels, row.status) &&
    date(row.createdAt) &&
    (row.generatedAt === null || date(row.generatedAt)) &&
    (row.readyAt === null || date(row.readyAt)) &&
    typeof row.className === 'string' &&
    row.className.length <= 512 &&
    (document === undefined
      ? row.status !== 'AVAILABLE'
      : !!document &&
        typeof document === 'object' &&
        uuid(document.id) &&
        ['ISSUED', 'CANCELLED', 'SUPERSEDED'].includes(String(document.state)))
  );
}
export function requestDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Recife',
  }).format(new Date(value));
}
