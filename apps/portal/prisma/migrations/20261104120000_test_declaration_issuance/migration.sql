ALTER TABLE declaration_documents ADD COLUMN origin VARCHAR(24) NOT NULL DEFAULT 'STAFF_DRAFT';
ALTER TABLE declaration_documents ADD COLUMN request_key UUID;
ALTER TABLE declaration_documents DROP CONSTRAINT declaration_documents_status_check;
ALTER TABLE declaration_documents ADD CONSTRAINT declaration_documents_status_check CHECK(status IN ('DRAFT','ISSUED'));
ALTER TABLE declaration_documents DROP CONSTRAINT declaration_documents_snapshot_check;
ALTER TABLE declaration_documents ADD CONSTRAINT declaration_documents_snapshot_check CHECK(jsonb_typeof(snapshot)='object' AND COALESCE(snapshot->>'type'='DECLARACAO_VINCULO',false) AND (
 (status='DRAFT' AND snapshot_version=1 AND origin='STAFF_DRAFT' AND request_key IS NULL)
 OR (status='ISSUED' AND snapshot_version=2 AND origin='STUDENT_REQUEST' AND request_key IS NOT NULL AND archive_sha256 IS NOT NULL AND source_pdf_page=1 AND COALESCE(snapshot->'testOnly'='true'::jsonb,false) AND COALESCE(length(snapshot->>'subjectName')>0,false))
));
CREATE UNIQUE INDEX declaration_documents_created_by_id_request_key_key ON declaration_documents(created_by_id,request_key);
CREATE TABLE declaration_current_issues (
 enrollment_id UUID NOT NULL,
 document_type VARCHAR(32) NOT NULL DEFAULT 'DECLARACAO_VINCULO',
 student_id UUID NOT NULL,
 document_id UUID NOT NULL UNIQUE,
 PRIMARY KEY(enrollment_id,document_type),
 CONSTRAINT declaration_current_issues_type_check CHECK(document_type='DECLARACAO_VINCULO'),
 CONSTRAINT declaration_current_issues_document_fkey FOREIGN KEY(document_id,student_id,enrollment_id) REFERENCES declaration_documents(id,student_id,enrollment_id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE FUNCTION check_current_declaration_issue() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM declaration_documents WHERE id=NEW.document_id AND status='ISSUED' AND snapshot_version=2) THEN
  RAISE EXCEPTION 'O documento atual deve ser uma emissão de teste registrada.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER declaration_current_issues_registered BEFORE INSERT OR UPDATE ON declaration_current_issues FOR EACH ROW EXECUTE FUNCTION check_current_declaration_issue();
