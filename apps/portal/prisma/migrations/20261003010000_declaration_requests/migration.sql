-- Funcionalidade de perfil aposentada. Referências antigas permanecem em arquivo
-- sem modelo Prisma/API; preserva arquivos do bucket para eventual limpeza separada.
ALTER TABLE "student_profile_photos" RENAME TO "retired_profile_photos";
CREATE TYPE "DeclarationRequestStatus" AS ENUM ('REQUESTED', 'IN_PREPARATION', 'READY_FOR_PICKUP');
CREATE TABLE "declaration_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "student_id" UUID NOT NULL,
  "enrollment_id" UUID NOT NULL,
  "status" "DeclarationRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generated_at" TIMESTAMPTZ(6),
  "ready_at" TIMESTAMPTZ(6),
  "prepared_by_id" UUID,
  "ready_by_id" UUID,
  CONSTRAINT "declaration_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "declaration_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "declaration_requests_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "declaration_requests_prepared_by_id_fkey" FOREIGN KEY ("prepared_by_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "declaration_requests_ready_by_id_fkey" FOREIGN KEY ("ready_by_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "declaration_requests_dates_check" CHECK (
    ("status" = 'REQUESTED' AND "generated_at" IS NULL AND "ready_at" IS NULL)
    OR ("status" = 'IN_PREPARATION' AND "generated_at" IS NOT NULL AND "ready_at" IS NULL)
    OR ("status" = 'READY_FOR_PICKUP' AND "generated_at" IS NOT NULL AND "ready_at" IS NOT NULL)
  )
);
CREATE INDEX "declaration_requests_student_id_created_at_idx" ON "declaration_requests"("student_id", "created_at");
CREATE INDEX "declaration_requests_status_created_at_idx" ON "declaration_requests"("status", "created_at");
CREATE INDEX "declaration_requests_enrollment_id_idx" ON "declaration_requests"("enrollment_id");
-- Uma solicitação aberta por matrícula, inclusive com chamadas simultâneas.
CREATE UNIQUE INDEX "declaration_requests_open_enrollment_key" ON "declaration_requests"("enrollment_id") WHERE "status" <> 'READY_FOR_PICKUP';
