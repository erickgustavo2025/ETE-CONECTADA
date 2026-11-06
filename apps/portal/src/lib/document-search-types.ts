export type DocumentState = 'DRAFT' | 'ISSUED' | 'CANCELLED' | 'SUPERSEDED';
export const documentStateLabels: Record<DocumentState, string> = {
  DRAFT: 'Minuta para conferência',
  ISSUED: 'Emitida para teste',
  CANCELLED: 'Cancelada',
  SUPERSEDED: 'Substituída',
};
export type DocumentListItem = {
  id: string;
  createdAt: string;
  state: DocumentState;
  className: string;
  mode: string;
  period: string;
  page: number;
};
export type DocumentStudent = {
  id: string;
  name: string;
  registration: string | null;
  count: number;
};
export type DocumentSearchResult = {
  students: DocumentStudent[];
  documents: DocumentListItem[];
  requests?: {
    id: string;
    name: string;
    registration: string | null;
    status: 'REQUESTED' | 'IN_PREPARATION' | 'READY_FOR_PICKUP' | 'AVAILABLE';
    createdAt: string;
    className: string;
    mode: string;
    period: string | null;
    document: { id: string; state: DocumentState } | null;
  }[];
  total: number;
  page: number;
  pageSize: number;
};
export type DocumentDetailResult = {
  document: DocumentListItem & {
    body: string;
    hasOriginal: boolean;
    verificationPath: string | null;
    sourcePdfSha256: string;
    history: {
      action: string;
      date: string;
      actor: string;
      reason: string | null;
      relatedId: string | null;
    }[];
  };
  successors: DocumentListItem[];
};
