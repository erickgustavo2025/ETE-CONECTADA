CREATE TABLE declaration_pdf_archives (
 sha256 CHAR(64) PRIMARY KEY,
 bytes BYTEA NOT NULL,
 page_count INTEGER NOT NULL,
 template_version VARCHAR(60) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT declaration_pdf_archives_hash_check CHECK(sha256 ~ '^[0-9a-f]{64}$' AND encode(sha256(bytes),'hex')=sha256),
 CONSTRAINT declaration_pdf_archives_size_check CHECK(octet_length(bytes) BETWEEN 1 AND 16777216),
 CONSTRAINT declaration_pdf_archives_header_check CHECK(substring(bytes FROM 1 FOR 5)=decode('255044462d','hex')),
 CONSTRAINT declaration_pdf_archives_pages_check CHECK(page_count BETWEEN 1 AND 100),
 CONSTRAINT declaration_pdf_archives_template_check CHECK(template_version='minuta-a4-v1')
);
CREATE TRIGGER declaration_pdf_archives_immutable BEFORE UPDATE ON declaration_pdf_archives
 FOR EACH ROW EXECUTE FUNCTION reject_declaration_document_update();
ALTER TABLE declaration_documents ADD COLUMN archive_sha256 CHAR(64);
ALTER TABLE declaration_documents ADD CONSTRAINT declaration_documents_archive_fkey FOREIGN KEY(archive_sha256) REFERENCES declaration_pdf_archives(sha256) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE declaration_documents ADD CONSTRAINT declaration_documents_archive_hash_check CHECK(archive_sha256 IS NULL OR archive_sha256=source_pdf_sha256);
CREATE INDEX declaration_documents_archive_sha256_idx ON declaration_documents(archive_sha256);
