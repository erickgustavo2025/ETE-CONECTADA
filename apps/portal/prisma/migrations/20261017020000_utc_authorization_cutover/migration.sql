-- Corte de interpretação de timestamptz: não deslocar timestamps históricos.
-- A aplicação antiga deve estar parada antes de aplicar esta migração.
-- Somente autorizações temporárias são invalidadas para não ampliar a validade
-- de credenciais emitidas com um fuso diferente. Contas e dados escolares ficam.
BEGIN;
DELETE FROM sheet_import_previews;
DELETE FROM password_reset_tokens;
DELETE FROM email_verification_tokens;
DELETE FROM sessions;
COMMIT;
