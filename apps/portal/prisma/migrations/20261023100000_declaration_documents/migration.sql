ALTER TABLE enrollments ADD CONSTRAINT enrollments_id_student_id_key UNIQUE(id,student_id);
CREATE TABLE declaration_documents (
 id UUID PRIMARY KEY,
 public_code VARCHAR(43) NOT NULL UNIQUE,
 student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
 enrollment_id UUID NOT NULL,
 created_by_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
 snapshot_version INTEGER NOT NULL DEFAULT 1,
 snapshot JSONB NOT NULL,
 source_pdf_sha256 CHAR(64) NOT NULL,
 source_pdf_page INTEGER NOT NULL,
 CONSTRAINT declaration_documents_enrollment_student_fkey FOREIGN KEY(enrollment_id,student_id) REFERENCES enrollments(id,student_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
 CONSTRAINT declaration_documents_status_check CHECK(status='DRAFT'),
 CONSTRAINT declaration_documents_code_check CHECK(public_code ~ '^[A-Za-z0-9_-]{43}$'),
 CONSTRAINT declaration_documents_hash_check CHECK(source_pdf_sha256 ~ '^[0-9a-f]{64}$'),
 CONSTRAINT declaration_documents_snapshot_check CHECK(snapshot_version=1 AND jsonb_typeof(snapshot)='object' AND COALESCE(snapshot->>'type'='DECLARACAO_VINCULO',false)),
 CONSTRAINT declaration_documents_page_check CHECK(source_pdf_page BETWEEN 1 AND 100)
);
CREATE INDEX declaration_documents_student_id_created_at_idx ON declaration_documents(student_id,created_at);
CREATE INDEX declaration_documents_enrollment_id_idx ON declaration_documents(enrollment_id);
CREATE INDEX declaration_documents_created_by_id_idx ON declaration_documents(created_by_id);
CREATE FUNCTION reject_declaration_document_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'O registro da minuta não pode ser alterado.' USING ERRCODE='23000';
END;
$$;
CREATE TRIGGER declaration_documents_immutable BEFORE UPDATE ON declaration_documents
 FOR EACH ROW EXECUTE FUNCTION reject_declaration_document_update();
