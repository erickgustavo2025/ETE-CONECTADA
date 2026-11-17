export type AdminStudent = {
  id: string;
  name: string;
  registration: string | null;
  loginBlocked: boolean;
  issuanceBlocked: boolean;
  academicWaiting: boolean;
  revision: number;
  accountStatus: string | null;
  enrollments: {
    id: string;
    mode: string;
    className: string;
    courseLabel: string;
    grade: number | null;
    moduleNumber: number | null;
    periodLabel: string | null;
    status: string;
    repetitionPending: boolean;
    repetitionOverride: boolean;
  }[];
};
export type AccessHistory = {
  kind: 'LOGIN' | 'ISSUANCE';
  blocked: boolean;
  reason: string;
  date: string;
  actor: string;
  revision: number;
};
export type StudentAdminResult = {
  students: AdminStudent[];
  student: AdminStudent | null;
  classes: string[];
  history: AccessHistory[];
  total: number;
  page: number;
  pageSize: number;
  created?: boolean;
};
export type SchoolClassSummary = {
  mode: 'INTEGRADO' | 'SUBSEQUENTE';
  className: string;
  periodLabel: string | null;
  courseLabel: string;
  students: number;
};
export type SchoolClassResult = {
  classes: SchoolClassSummary[];
  page: number;
  hasNext: boolean;
  updating: boolean;
  nextCursor: string | null;
};
