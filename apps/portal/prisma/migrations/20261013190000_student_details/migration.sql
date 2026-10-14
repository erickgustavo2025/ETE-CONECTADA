-- Dados antigos permanecem sem complemento: não preencher filiação/naturalidade por suposição.
CREATE TYPE "StudentDataSource" AS ENUM ('SCHOOL_RECORD', 'STUDENT_DECLARATION', 'SECRETARY_CORRECTION');

CREATE TABLE "student_details" (
  "student_id" UUID NOT NULL,
  "parent_one" VARCHAR(180),
  "parent_two" VARCHAR(180),
  "parentage_source" "StudentDataSource",
  "social_name" VARCHAR(180),
  "social_name_source" "StudentDataSource",
  "birth_city" VARCHAR(120),
  "birth_state" VARCHAR(2),
  "birth_country" VARCHAR(2),
  "birthplace_source" "StudentDataSource",
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id" UUID,
  CONSTRAINT "student_details_pkey" PRIMARY KEY ("student_id"),
  CONSTRAINT "student_details_parentage_check" CHECK (
    ("parent_one" IS NULL AND "parent_two" IS NULL AND "parentage_source" IS NULL) OR
    ("parent_one" IS NOT NULL AND length(btrim("parent_one")) > 0 AND
      ("parent_two" IS NULL OR length(btrim("parent_two")) > 0) AND
      "parentage_source" IS NOT NULL AND "parentage_source" <> 'STUDENT_DECLARATION')
  ),
  CONSTRAINT "student_details_social_name_check" CHECK (
    ("social_name" IS NULL OR length(btrim("social_name")) > 0) AND
    ("social_name" IS NULL OR "social_name_source" IS NOT NULL)
  ),
  CONSTRAINT "student_details_birthplace_check" CHECK (
    ("birth_city" IS NULL AND "birth_state" IS NULL AND "birth_country" IS NULL AND "birthplace_source" IS NULL) OR
    ("birth_city" IS NOT NULL AND length(btrim("birth_city")) > 0 AND
      "birth_country" IS NOT NULL AND "birth_country" ~ '^[A-Z]{2}$' AND
      "birthplace_source" IS NOT NULL AND
      (("birth_country" = 'BR' AND "birth_state" IS NOT NULL AND
        "birth_state" IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')) OR
       ("birth_country" <> 'BR' AND "birth_state" IS NULL)))
  )
);

ALTER TABLE "student_details" ADD CONSTRAINT "student_details_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_details" ADD CONSTRAINT "student_details_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
