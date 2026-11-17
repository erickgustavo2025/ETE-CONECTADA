export type AcademicDetail = {
  academicWaiting: boolean;
  enrollment: {
    id: string;
    className: string;
    mode: string;
    courseLabel: string;
    stage: number | null;
    periodLabel: string | null;
    status: string;
    validFrom: string | null;
    validUntil: string | null;
    progressionHeld: boolean;
    repetitionPending: boolean;
    repetitionOverride: boolean;
    nextClassName: string | null;
    version: string;
    nextDate: string | null;
    previousStage: number | null;
  };
  history: {
    kind: string;
    requestsAllowed?: boolean;
    reason: string;
    date: string;
    effectiveOn: string;
    actor: string;
  }[];
  total: number;
  page: number;
  pageSize: number;
  created?: boolean;
};
