-- A trava antiga permitia progressão somente a vínculos com calendário subsequente.
-- O integrado tem passagem anual própria e nunca recebe referência de subsequente.
ALTER TABLE enrollments DROP CONSTRAINT enrollments_calendar_check;
ALTER TABLE enrollments ADD CONSTRAINT enrollments_calendar_check CHECK (
 (mode='INTEGRADO' AND offering_id IS NULL AND calendar_module IS NULL AND calendar_revision IS NULL) OR
 (mode='SUBSEQUENTE' AND (
  (offering_id IS NULL AND calendar_module IS NULL AND calendar_revision IS NULL AND progression_held) OR
  (offering_id IS NOT NULL AND calendar_module IS NOT NULL AND calendar_module BETWEEN 1 AND 4 AND calendar_revision IS NOT NULL AND calendar_revision>0)
 ))
);
