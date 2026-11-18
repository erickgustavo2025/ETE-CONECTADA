-- Mantém as referências e a autoria dos registros já gravados.
BEGIN;

ALTER TABLE public.student_access_changes
  DROP CONSTRAINT student_access_changes_student_id_fkey,
  ADD CONSTRAINT student_access_changes_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE public.enrollment_import_history
  DROP CONSTRAINT enrollment_import_history_enrollment_id_fkey,
  DROP CONSTRAINT enrollment_import_history_recorded_by_id_fkey,
  ADD CONSTRAINT enrollment_import_history_enrollment_id_fkey
    FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT enrollment_import_history_recorded_by_id_fkey
    FOREIGN KEY (recorded_by_id) REFERENCES public.accounts(id) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE public.course_calendar_versions
  DROP CONSTRAINT course_calendar_versions_created_by_id_fkey,
  ADD CONSTRAINT course_calendar_versions_created_by_id_fkey
    FOREIGN KEY (created_by_id) REFERENCES public.accounts(id) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE public.declaration_requests
  DROP CONSTRAINT declaration_requests_student_id_fkey,
  DROP CONSTRAINT declaration_requests_enrollment_id_fkey,
  DROP CONSTRAINT declaration_requests_prepared_by_id_fkey,
  DROP CONSTRAINT declaration_requests_ready_by_id_fkey,
  DROP CONSTRAINT declaration_requests_document_fkey,
  ADD CONSTRAINT declaration_requests_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT declaration_requests_enrollment_id_fkey
    FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT declaration_requests_prepared_by_id_fkey
    FOREIGN KEY (prepared_by_id) REFERENCES public.accounts(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT declaration_requests_ready_by_id_fkey
    FOREIGN KEY (ready_by_id) REFERENCES public.accounts(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT declaration_requests_document_fkey
    FOREIGN KEY (document_id, student_id, enrollment_id)
    REFERENCES public.declaration_documents(id, student_id, enrollment_id)
    ON DELETE RESTRICT ON UPDATE NO ACTION;

CREATE FUNCTION public.reject_audit_history_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'O histórico não pode ser alterado ou apagado.' USING ERRCODE = '23000';
END;
$$;

-- Em pedidos a atualização de estado faz parte do fluxo operacional.
DO $$
DECLARE
  entry record;
  change_events text;
  truncate_trigger text;
BEGIN
  FOR entry IN SELECT * FROM (VALUES
    ('student_access_changes', 'student_access_changes_immutable', true),
    ('enrollment_import_history', 'enrollment_import_history_immutable', true),
    ('course_calendar_versions', 'course_calendar_versions_immutable', true),
    ('declaration_documents', 'declaration_documents_immutable', true),
    ('declaration_pdf_archives', 'declaration_pdf_archives_immutable', true),
    ('declaration_document_actions', 'document_actions_immutable', true),
    ('school_academic_events', 'school_academic_events_immutable', true),
    ('declaration_requests', 'declaration_requests_no_delete', false)
  ) AS rules(table_name, row_trigger, rejects_update)
  LOOP
    change_events := CASE WHEN entry.rejects_update THEN 'UPDATE OR DELETE' ELSE 'DELETE' END;
    truncate_trigger := entry.table_name || '_no_truncate';
    EXECUTE format('CREATE OR REPLACE TRIGGER %I BEFORE %s ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reject_audit_history_write()',
      entry.row_trigger, change_events, entry.table_name);
    EXECUTE format('CREATE OR REPLACE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.reject_audit_history_write()',
      truncate_trigger, entry.table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ALWAYS TRIGGER %I, ENABLE ALWAYS TRIGGER %I',
      entry.table_name, entry.row_trigger, truncate_trigger);
  END LOOP;
END;
$$;

COMMIT;
