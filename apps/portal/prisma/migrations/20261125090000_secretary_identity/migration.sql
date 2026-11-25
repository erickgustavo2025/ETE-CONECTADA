BEGIN;

ALTER TABLE public.accounts
  ALTER COLUMN student_id DROP NOT NULL,
  ADD COLUMN staff_name varchar(180),
  ADD CONSTRAINT accounts_identity_check CHECK (
    (student_id IS NOT NULL AND staff_name IS NULL)
    OR (student_id IS NULL AND role = 'secretary' AND staff_name IS NOT NULL
        AND btrim(staff_name) <> '' AND status IN ('pending', 'active')
        AND (status <> 'pending' OR password_hash IS NULL))
  );

-- Guardar autoria nas contas já existentes, sem promover alunos pelo portal.
CREATE FUNCTION public.protect_account_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'student' THEN RETURN NEW; END IF;
  ELSIF ROW(NEW.student_id, NEW.role, NEW.staff_name)
      IS NOT DISTINCT FROM ROW(OLD.student_id, OLD.role, OLD.staff_name) THEN
    RETURN NEW;
  END IF;
  IF NOT pg_has_role(current_user, (
    SELECT relowner FROM pg_class WHERE oid = 'public.accounts'::regclass
  ), 'MEMBER') THEN
    RAISE EXCEPTION 'Somente manutenção pode alterar identidade da conta.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER accounts_protect_identity
  BEFORE INSERT OR UPDATE OF student_id, role, staff_name ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.protect_account_identity();

COMMIT;
