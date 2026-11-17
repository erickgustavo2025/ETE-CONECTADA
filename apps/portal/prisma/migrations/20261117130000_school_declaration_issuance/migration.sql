-- Versão explícita para novas emissões; nenhum snapshot/arquivo antigo é reescrito.
ALTER TABLE declaration_documents DROP CONSTRAINT declaration_documents_snapshot_check;
ALTER TABLE declaration_documents ADD CONSTRAINT declaration_documents_snapshot_check CHECK(
 jsonb_typeof(snapshot)='object' AND COALESCE(snapshot->>'type'='DECLARACAO_VINCULO',false) AND (
  (status='DRAFT' AND snapshot_version=1 AND origin='STAFF_DRAFT' AND request_key IS NULL)
  OR (status='ISSUED' AND origin='STUDENT_REQUEST' AND request_key IS NOT NULL AND archive_sha256 IS NOT NULL AND source_pdf_page=1 AND COALESCE(length(snapshot->>'subjectName')>0,false) AND (
   (snapshot_version=2 AND COALESCE(snapshot->'testOnly'='true'::jsonb,false))
   OR (snapshot_version=3 AND COALESCE(snapshot->'testOnly'='false'::jsonb,false) AND COALESCE(snapshot->>'issuanceMode'='SCHOOL',false))
  ))
 ));
ALTER TABLE declaration_pdf_archives DROP CONSTRAINT declaration_pdf_archives_template_check;
ALTER TABLE declaration_pdf_archives ADD CONSTRAINT declaration_pdf_archives_template_check
 CHECK(template_version::text IN ('minuta-a4-v1'::text,'minuta-a4-qr-v1'::text,'vinculo-a4-qr-v1'::text));
CREATE OR REPLACE FUNCTION check_current_declaration_issue() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM declaration_documents WHERE id=NEW.document_id AND status='ISSUED' AND snapshot_version IN (2,3)) THEN
  RAISE EXCEPTION 'O documento atual deve ser uma emissão registrada.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
