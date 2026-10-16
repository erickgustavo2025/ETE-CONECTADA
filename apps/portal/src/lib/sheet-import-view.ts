// Contrato da tela; sem biblioteca de XLS, banco ou dados de conta no cliente.
export type ImportContextView = {
  sheetName: string;
  scopeId: string;
  className: string;
  periodLabel: string;
  courseLabel: 'ADM' | 'DS';
  stage: number;
  confirmed: boolean;
  bindings: Record<string, string>;
};
export type ImportInspection = {
  sheets: Array<{
    sheetName: string;
    courseLabel: 'ADM' | 'DS';
    stage: number;
    rows: number;
  }>;
  sources: Array<{
    scopeId: string;
    courseLabel: string;
    label: string;
    className: string;
    periodLabel: string;
  }>;
};
export type ImportCounts = {
  createdStudents: number;
  createdEnrollments: number;
  updatedStudents: number;
  updatedEnrollments: number;
  unchanged: number;
  absent: number;
  conflicts: number;
  identityChanges: number;
};
export type ImportPreviewView = {
  token: string;
  expiresAt: string;
  counts: ImportCounts;
  entries: Array<{
    sheet: number;
    line: number;
    incoming: {
      schoolRegistration: string;
      fullName: string;
      birthDate: string;
      parentOne?: string;
      parentTwo?: string;
    };
    action: 'create' | 'update' | 'unchanged' | 'conflict';
    identityChange: boolean;
    changes: Array<{
      field: string;
      before: string | null;
      after: string | null;
    }>;
    conflictReason: string | null;
    needsBinding: boolean;
    candidates: Array<{
      id: string;
      className: string;
      periodLabel: string | null;
      status: string;
      grade: number | null;
    }>;
  }>;
};
export const IMPORT_ACTION_LABELS = {
  create: 'Incluir',
  update: 'Atualizar',
  unchanged: 'Sem alteração',
  conflict: 'Conflito',
};
export const IMPORT_FIELD_LABELS: Record<string, string> = {
  fullName: 'Nome',
  birthDate: 'Nascimento',
  parentOne: 'Filiação registrada',
  parentTwo: 'Segunda filiação',
  className: 'Turma',
  courseLabel: 'Curso',
  periodLabel: 'Período',
  grade: 'Série',
  moduleNumber: 'Módulo',
};
