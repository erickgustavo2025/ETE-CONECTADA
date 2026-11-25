BEGIN;

CREATE TABLE public.staff_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  action varchar(24) NOT NULL CHECK (action IN ('STAFF_INVITED', 'STAFF_REVOKED')),
  operator_name text NOT NULL DEFAULT session_user,
  reason varchar(300) NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 300),
  created_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX staff_access_events_account_id_created_at_id_idx
  ON public.staff_access_events(account_id, created_at, id);

CREATE TRIGGER staff_access_events_immutable
  BEFORE UPDATE OR DELETE ON public.staff_access_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_audit_history_write();

CREATE TRIGGER staff_access_events_no_truncate
  BEFORE TRUNCATE ON public.staff_access_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_audit_history_write();

ALTER TABLE public.staff_access_events
  ENABLE ALWAYS TRIGGER staff_access_events_immutable,
  ENABLE ALWAYS TRIGGER staff_access_events_no_truncate;

COMMIT;
