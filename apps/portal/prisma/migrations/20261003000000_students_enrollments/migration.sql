ALTER TABLE "students" ALTER COLUMN "cpf" DROP NOT NULL;
ALTER TABLE "students" ADD COLUMN "school_registration" TEXT,
  ADD COLUMN "import_source_id" TEXT,
  ADD COLUMN "registration_allowed" BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX "students_school_registration_key" ON "students"("school_registration");
CREATE UNIQUE INDEX "students_import_source_id_key" ON "students"("import_source_id");
ALTER TABLE "accounts" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'student';
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_role_check" CHECK ("role" IN ('student', 'secretary'));
CREATE TYPE "EducationMode" AS ENUM ('INTEGRADO', 'SUBSEQUENTE');
CREATE TABLE "enrollments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "student_id" UUID NOT NULL,
  "mode" "EducationMode" NOT NULL,
  "class_name" TEXT NOT NULL,
  "grade" INTEGER,
  "course_label" TEXT NOT NULL,
  "school_year" INTEGER,
  "import_source_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "enrollments_import_source_id_key" ON "enrollments"("import_source_id");
CREATE INDEX "enrollments_student_id_idx" ON "enrollments"("student_id");
CREATE INDEX "enrollments_class_name_idx" ON "enrollments"("class_name");
