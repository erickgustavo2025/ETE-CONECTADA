ALTER TABLE declaration_documents ADD CONSTRAINT declaration_documents_id_student_id_enrollment_id_key UNIQUE(id,student_id,enrollment_id);
CREATE TABLE declaration_document_actions (
 document_id UUID PRIMARY KEY,
 student_id UUID NOT NULL,
 enrollment_id UUID NOT NULL,
 action VARCHAR(16) NOT NULL,
 reason VARCHAR(500) NOT NULL,
 successor_id UUID UNIQUE,
 created_by_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT document_actions_original_fkey FOREIGN KEY(document_id,student_id,enrollment_id) REFERENCES declaration_documents(id,student_id,enrollment_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
 CONSTRAINT document_actions_successor_fkey FOREIGN KEY(successor_id,student_id,enrollment_id) REFERENCES declaration_documents(id,student_id,enrollment_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
 CONSTRAINT document_actions_kind_check CHECK((action='CANCELLED' AND successor_id IS NULL) OR (action='SUPERSEDED' AND successor_id IS NOT NULL AND successor_id<>document_id)),
 CONSTRAINT document_actions_reason_check CHECK(length(btrim(reason)) >= 3 AND length(btrim(reason)) <= 500 AND reason !~ '[[:cntrl:]]')
);
CREATE INDEX declaration_document_actions_created_by_id_idx ON declaration_document_actions(created_by_id);
CREATE TRIGGER document_actions_immutable BEFORE UPDATE ON declaration_document_actions
 FOR EACH ROW EXECUTE FUNCTION reject_declaration_document_update();
