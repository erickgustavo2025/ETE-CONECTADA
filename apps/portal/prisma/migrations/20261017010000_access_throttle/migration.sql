CREATE TABLE access_throttle_state (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  key_material CHAR(64) NOT NULL CHECK (key_material ~ '^[0-9a-f]{64}$'),
  last_sweep_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Duas UUIDs aleatórias formam uma chave interna persistente, sem novo segredo no .env.
INSERT INTO access_throttle_state (id, key_material)
VALUES (1, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

CREATE TABLE access_attempt_buckets (
  key CHAR(64) PRIMARY KEY CHECK (key ~ '^[0-9a-f]{64}$'),
  used INTEGER NOT NULL CHECK (used >= 1 AND used <= 600),
  window_started_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT access_attempt_dates_check CHECK (expires_at > window_started_at)
);
CREATE INDEX access_attempt_buckets_expires_at_idx ON access_attempt_buckets(expires_at);
