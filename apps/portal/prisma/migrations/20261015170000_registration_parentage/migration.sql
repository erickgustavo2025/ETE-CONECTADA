-- Coluna aditiva: links antigos ficam sem conferência e devem ser renovados.
-- Nenhuma conta, credencial, sessão ou dado escolar é removido.
ALTER TABLE email_verification_tokens ADD COLUMN claim_data_hash CHAR(64);
ALTER TABLE email_verification_tokens ADD CONSTRAINT email_verification_claim_hash_check
  CHECK (claim_data_hash IS NULL OR claim_data_hash ~ '^[0-9a-f]{64}$');
