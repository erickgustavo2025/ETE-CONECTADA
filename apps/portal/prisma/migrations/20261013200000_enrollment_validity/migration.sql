CREATE TYPE "EnrollmentStatus" AS ENUM ('UNCONFIRMED', 'ACTIVE', 'ENDED');

-- Importação antiga não comprova vínculo atual: não preencher situação/datas por suposição.
ALTER TABLE "enrollments"
  ADD COLUMN "status" "EnrollmentStatus" NOT NULL DEFAULT 'UNCONFIRMED',
  ADD COLUMN "period_label" VARCHAR(60),
  ADD COLUMN "valid_from" DATE,
  ADD COLUMN "valid_until" DATE,
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(6),
  ADD COLUMN "reviewed_by_id" UUID,
  ADD CONSTRAINT "enrollments_validity_check" CHECK (
    ("valid_from" IS NULL AND "valid_until" IS NULL) OR
    ("valid_from" IS NOT NULL AND "valid_until" IS NOT NULL AND "valid_from" <= "valid_until")
  ),
  ADD CONSTRAINT "enrollments_active_check" CHECK (
    "status" <> 'ACTIVE' OR (
      "period_label" IS NOT NULL AND length(btrim("period_label")) > 0 AND
      "valid_from" IS NOT NULL AND "valid_until" IS NOT NULL AND "reviewed_at" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "enrollments_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id")
    REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
