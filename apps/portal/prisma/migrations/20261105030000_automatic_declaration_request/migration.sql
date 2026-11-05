ALTER TABLE declaration_requests ADD COLUMN document_id UUID;
CREATE UNIQUE INDEX declaration_requests_document_id_key ON declaration_requests(document_id);
ALTER TABLE declaration_requests ADD CONSTRAINT declaration_requests_document_fkey
 FOREIGN KEY(document_id,student_id,enrollment_id) REFERENCES declaration_documents(id,student_id,enrollment_id) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE declaration_requests DROP CONSTRAINT declaration_requests_dates_check;
ALTER TABLE declaration_requests ADD CONSTRAINT declaration_requests_dates_check CHECK (
 (status='REQUESTED' AND generated_at IS NULL AND ready_at IS NULL AND document_id IS NULL)
 OR (status='IN_PREPARATION' AND generated_at IS NOT NULL AND ready_at IS NULL AND document_id IS NULL)
 OR (status='READY_FOR_PICKUP' AND generated_at IS NOT NULL AND ready_at IS NOT NULL AND document_id IS NULL)
 OR (status='AVAILABLE' AND generated_at IS NOT NULL AND ready_at IS NULL AND prepared_by_id IS NULL AND ready_by_id IS NULL AND document_id IS NOT NULL)
);
DROP INDEX declaration_requests_open_enrollment_key;
CREATE UNIQUE INDEX declaration_requests_open_enrollment_key ON declaration_requests(enrollment_id) WHERE status IN ('REQUESTED','IN_PREPARATION');

CREATE FUNCTION check_automatic_declaration_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='AVAILABLE' AND NOT EXISTS(SELECT 1 FROM declaration_documents WHERE id=NEW.document_id AND status='ISSUED' AND origin='STUDENT_REQUEST') THEN
  RAISE EXCEPTION 'O pedido disponível precisa de uma emissão registrada.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER declaration_requests_registered BEFORE INSERT OR UPDATE ON declaration_requests FOR EACH ROW EXECUTE FUNCTION check_automatic_declaration_request();
