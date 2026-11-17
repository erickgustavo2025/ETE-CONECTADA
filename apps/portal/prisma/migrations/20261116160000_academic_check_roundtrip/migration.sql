-- Expressões equivalentes, sem BETWEEN aninhado: pg_dump/restore preserva a
-- mesma árvore de AND e permite comparar o catálogo sem relaxar a validação.
ALTER TABLE enrollments DROP CONSTRAINT enrollments_next_class_name_check;
ALTER TABLE enrollments ADD CONSTRAINT enrollments_next_class_name_check CHECK (
 next_class_name IS NULL OR (
  length(btrim(next_class_name)) >= 1 AND length(btrim(next_class_name)) <= 100
  AND next_class_name !~ '[[:cntrl:]]'
 )
);
ALTER TABLE school_academic_events DROP CONSTRAINT school_academic_events_reason_check;
ALTER TABLE school_academic_events ADD CONSTRAINT school_academic_events_reason_check CHECK (
 length(btrim(reason)) >= 3 AND length(btrim(reason)) <= 500
 AND reason !~ '[[:cntrl:]]'
);
