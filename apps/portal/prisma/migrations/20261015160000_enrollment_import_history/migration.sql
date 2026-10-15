-- Apenas versões futuras: não inventa histórico ou altera vínculos existentes.
CREATE TABLE enrollment_import_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE ON UPDATE CASCADE,
  recorded_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recorded_by_id UUID REFERENCES accounts(id) ON DELETE SET NULL ON UPDATE CASCADE,
  reason VARCHAR(32) NOT NULL,
  mode "EducationMode" NOT NULL,
  class_name TEXT NOT NULL,
  grade INTEGER,
  module_number INTEGER,
  course_label TEXT NOT NULL,
  school_year INTEGER,
  period_label VARCHAR(60),
  valid_from DATE,
  valid_until DATE,
  status "EnrollmentStatus" NOT NULL,
  reviewed_at TIMESTAMPTZ(6),
  CONSTRAINT enrollment_import_history_reason_check CHECK (reason IN ('METADATA_CHANGE', 'IDENTITY_REVIEW'))
);
CREATE INDEX enrollment_import_history_enrollment_id_recorded_at_id_idx ON enrollment_import_history(enrollment_id, recorded_at, id);
CREATE INDEX enrollment_import_history_recorded_by_id_idx ON enrollment_import_history(recorded_by_id);
