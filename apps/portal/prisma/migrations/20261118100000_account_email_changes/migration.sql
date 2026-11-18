BEGIN;

CREATE TABLE public.account_email_changes (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  new_email varchar(254) NOT NULL CHECK (length(btrim(new_email)) > 0 AND lower(new_email) = new_email),
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  credential_hash char(64) NOT NULL CHECK (credential_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  expires_at timestamptz(6) NOT NULL CHECK (expires_at > created_at)
);

COMMIT;
