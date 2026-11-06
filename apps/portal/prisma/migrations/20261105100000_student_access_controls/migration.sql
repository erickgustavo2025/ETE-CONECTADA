ALTER TABLE students
 ADD COLUMN login_blocked BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN issuance_blocked BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN access_revision INTEGER NOT NULL DEFAULT 0,
 ADD CONSTRAINT students_access_revision_check CHECK(access_revision >= 0);
CREATE TABLE student_access_changes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE ON UPDATE NO ACTION,
 created_by_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
 request_key UUID NOT NULL,
 kind VARCHAR(16) NOT NULL,
 blocked BOOLEAN NOT NULL,
 reason VARCHAR(500) NOT NULL,
 revision INTEGER NOT NULL CHECK(revision > 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT student_access_changes_kind_check CHECK(kind::text = ANY(ARRAY['LOGIN'::text,'ISSUANCE'::text])),
 CONSTRAINT student_access_changes_reason_check CHECK(length(btrim(reason)) >= 3 AND length(btrim(reason)) <= 500 AND reason !~ '[[:cntrl:]]'),
 CONSTRAINT student_access_changes_created_by_id_request_key_key UNIQUE(created_by_id,request_key),
 CONSTRAINT student_access_changes_student_id_revision_key UNIQUE(student_id,revision)
);
CREATE INDEX student_access_changes_student_id_created_at_idx ON student_access_changes(student_id,created_at);
CREATE TRIGGER student_access_changes_immutable BEFORE UPDATE ON student_access_changes
 FOR EACH ROW EXECUTE FUNCTION reject_declaration_document_update();
