ALTER TABLE enrollments
 ADD COLUMN repetition_pending BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN repetition_override BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN academic_revision INTEGER NOT NULL DEFAULT 0 CHECK(academic_revision>=0),
 ADD COLUMN entry_started_on DATE,
 ADD COLUMN next_class_name VARCHAR(100),
 ADD CONSTRAINT enrollments_repetition_override_check CHECK(NOT repetition_override OR repetition_pending),
 ADD CONSTRAINT enrollments_next_class_name_check CHECK(next_class_name IS NULL OR (length(btrim(next_class_name)) BETWEEN 1 AND 100 AND next_class_name !~ '[[:cntrl:]]'));
CREATE TABLE school_academic_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
 actor_id UUID REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
 operation_key VARCHAR(160) NOT NULL UNIQUE,
 kind VARCHAR(24) NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>0),
 before_state JSONB NOT NULL CHECK(jsonb_typeof(before_state)='object'),
 after_state JSONB NOT NULL CHECK(jsonb_typeof(after_state)='object'),
 effective_on DATE NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 reason VARCHAR(500) NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500 AND reason !~ '[[:cntrl:]]'),
 CONSTRAINT school_academic_events_kind_check CHECK(kind::text=ANY(ARRAY['PROGRESSION'::text,'CONTINUITY'::text,'REPEAT'::text,'RESUME'::text,'OVERRIDE'::text,'TRANSFER'::text,'END'::text,'REOPEN'::text,'ENABLE'::text])),
 CONSTRAINT school_academic_events_enrollment_id_revision_key UNIQUE(enrollment_id,revision)
);
CREATE INDEX school_academic_events_created_at_id_idx ON school_academic_events(created_at,id);
CREATE INDEX school_academic_events_actor_id_idx ON school_academic_events(actor_id);
CREATE TRIGGER school_academic_events_immutable BEFORE UPDATE OR DELETE ON school_academic_events
 FOR EACH ROW EXECUTE FUNCTION reject_declaration_document_update();
CREATE TRIGGER school_academic_events_no_truncate BEFORE TRUNCATE ON school_academic_events
 FOR EACH STATEMENT EXECUTE FUNCTION reject_declaration_document_update();
CREATE FUNCTION check_school_academic_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id UUID; current_revision INTEGER; last_revision INTEGER;
BEGIN
 IF TG_TABLE_NAME='enrollments' THEN target_id:=NEW.id; ELSE target_id:=NEW.enrollment_id; END IF;
 SELECT academic_revision INTO current_revision FROM enrollments WHERE id=target_id;
 SELECT COALESCE(max(revision),0) INTO last_revision FROM school_academic_events WHERE enrollment_id=target_id;
 IF current_revision IS DISTINCT FROM last_revision THEN
  RAISE EXCEPTION 'A situação acadêmica e seu histórico precisam ser registrados juntos.' USING ERRCODE='23000';
 END IF;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER school_academic_events_revision AFTER INSERT ON school_academic_events
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_school_academic_revision();
CREATE CONSTRAINT TRIGGER enrollment_academic_revision AFTER UPDATE ON enrollments
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(OLD.academic_revision IS DISTINCT FROM NEW.academic_revision)
 EXECUTE FUNCTION check_school_academic_revision();
