ALTER TABLE accounts ADD COLUMN password_reset_at TIMESTAMPTZ;
CREATE TABLE password_reset_tokens (
  token_hash CHAR(64) PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  credential_hash CHAR(64) NOT NULL CHECK (credential_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT password_reset_dates_check CHECK (expires_at > created_at)
);
CREATE INDEX password_reset_tokens_account_id_idx ON password_reset_tokens(account_id);
