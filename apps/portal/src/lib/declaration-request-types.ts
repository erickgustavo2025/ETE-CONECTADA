export const requestStatusLabels = {
  REQUESTED: "Solicitada",
  IN_PREPARATION: "Em preparação",
  READY_FOR_PICKUP: "Pronta para retirada",
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
};
export function requestDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Recife",
  }).format(new Date(value));
}
