BEGIN;

CREATE TABLE public.account_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  action varchar(24) NOT NULL CHECK (action IN ('PASSWORD_CHANGED', 'EMAIL_CHANGED')),
  created_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX account_security_events_account_id_created_at_id_idx
  ON public.account_security_events(account_id, created_at, id);

CREATE TRIGGER account_security_events_immutable
  BEFORE UPDATE OR DELETE ON public.account_security_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_audit_history_write();

CREATE TRIGGER account_security_events_no_truncate
  BEFORE TRUNCATE ON public.account_security_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_audit_history_write();

ALTER TABLE public.account_security_events
  ENABLE ALWAYS TRIGGER account_security_events_immutable,
  ENABLE ALWAYS TRIGGER account_security_events_no_truncate;

COMMIT;
