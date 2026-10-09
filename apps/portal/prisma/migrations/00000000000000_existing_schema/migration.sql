-- Baseline: inclui CHECKs que o Prisma não representa no schema.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf CHAR(11) NOT NULL UNIQUE CHECK (cpf ~ '^[0-9]{11}$'),
  birth_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'unclaimed'
    CHECK (status IN ('unclaimed', 'pending', 'active')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'unclaimed' AND email IS NULL AND password_hash IS NULL)
      OR (status = 'pending' AND email IS NOT NULL)
      OR (status = 'active' AND email IS NOT NULL AND password_hash IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash TEXT PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_verification_tokens_account_id_idx
  ON email_verification_tokens(account_id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_account_id_idx ON sessions(account_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

ALTER TABLE students ADD COLUMN IF NOT EXISTS full_name TEXT;

CREATE TABLE IF NOT EXISTS student_profile_photos (
  student_id UUID PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  photo_data BYTEA NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (octet_length(photo_data) <= 2097152)
);


CREATE TABLE IF NOT EXISTS portal_schema_migrations (
  version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
