CREATE TABLE course_offerings (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 label VARCHAR(120) NOT NULL CHECK(length(trim(label)) > 0),
 course_label VARCHAR(3) NOT NULL CHECK(course_label IN ('ADM','DS','ENF')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 last_import_at TIMESTAMPTZ,
 last_import_module INTEGER,
 last_import_period VARCHAR(60),
 CONSTRAINT course_offerings_import_check CHECK(
  (last_import_at IS NULL AND last_import_module IS NULL AND last_import_period IS NULL) OR
  (last_import_at IS NOT NULL AND last_import_module IS NOT NULL AND last_import_module BETWEEN 1 AND 4 AND last_import_period IS NOT NULL AND length(trim(last_import_period))>0)
 )
);
CREATE TABLE course_calendar_versions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL CHECK(revision > 0),
 schedule JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 created_by_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
 CONSTRAINT course_calendar_versions_offering_id_revision_key UNIQUE(offering_id,revision),
 CONSTRAINT course_calendar_schedule_check CHECK (
  jsonb_typeof(schedule)='object' AND schedule ? 'modules' AND schedule ? 'courseLabel' AND jsonb_typeof(schedule->'modules')='array' AND
  (((schedule->>'courseLabel') IN ('ADM','DS') AND jsonb_array_length(schedule->'modules')=3) OR
   ((schedule->>'courseLabel')='ENF' AND jsonb_array_length(schedule->'modules')=4))
 )
);
CREATE INDEX course_calendar_versions_created_by_id_idx ON course_calendar_versions(created_by_id);
ALTER TABLE enrollments
 ADD COLUMN offering_id UUID REFERENCES course_offerings(id) ON DELETE RESTRICT,
 ADD COLUMN calendar_module INTEGER,
 ADD COLUMN calendar_revision INTEGER,
 ADD COLUMN progression_held BOOLEAN NOT NULL DEFAULT true,
 ADD CONSTRAINT enrollments_calendar_check CHECK (
  (offering_id IS NULL AND calendar_module IS NULL AND calendar_revision IS NULL AND progression_held) OR
  (mode='SUBSEQUENTE' AND offering_id IS NOT NULL AND calendar_module IS NOT NULL AND calendar_module BETWEEN 1 AND 4 AND calendar_revision IS NOT NULL AND calendar_revision > 0)
 );
CREATE INDEX enrollments_offering_id_idx ON enrollments(offering_id);
ALTER TABLE enrollment_import_history
 ADD COLUMN offering_id UUID,
 ADD COLUMN calendar_revision INTEGER,
 ADD COLUMN progression_held BOOLEAN;
ALTER TABLE enrollment_import_history DROP CONSTRAINT enrollment_import_history_reason_check;
ALTER TABLE enrollment_import_history ADD CONSTRAINT enrollment_import_history_reason_check CHECK(reason IN ('METADATA_CHANGE','IDENTITY_REVIEW','CALENDAR_PROGRESSION','CALENDAR_BINDING','CALENDAR_HOLD'));
