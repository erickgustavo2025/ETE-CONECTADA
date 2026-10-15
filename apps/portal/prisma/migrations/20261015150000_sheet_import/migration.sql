ALTER TABLE enrollments ADD COLUMN school_import_key VARCHAR(80), ADD COLUMN module_number INTEGER;
CREATE UNIQUE INDEX enrollments_school_import_key_key ON enrollments(school_import_key);
ALTER TABLE enrollments ADD CONSTRAINT enrollments_module_number_check CHECK (
  module_number IS NULL OR (mode='SUBSEQUENTE' AND grade IS NULL AND module_number BETWEEN 1 AND 4)
);
CREATE TABLE sheet_import_previews (
  actor_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  input_hash CHAR(64) NOT NULL,
  snapshot_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ(3) NOT NULL,
  consumed_at TIMESTAMPTZ(3),
  result JSONB
);
