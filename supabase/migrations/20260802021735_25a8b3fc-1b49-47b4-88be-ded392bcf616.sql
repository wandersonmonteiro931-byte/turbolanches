ALTER TABLE public.staff_members
  ADD COLUMN IF NOT EXISTS employee_code text,
  ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_members_username
  ON public.staff_members (lower(username)) WHERE username IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_members_employee_code
  ON public.staff_members (store_id, upper(employee_code)) WHERE employee_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.next_staff_employee_code(_store_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num int;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(employee_code, '\D', '', 'g'), '')::int), 0) + 1
  INTO next_num
  FROM public.staff_members
  WHERE _store_id IS NULL OR store_id = _store_id;

  RETURN 'M' || LPAD(next_num::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_staff_employee_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_staff_employee_code(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_staff_employee_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.employee_code IS NULL OR btrim(NEW.employee_code) = '' THEN
    NEW.employee_code := public.next_staff_employee_code(NEW.store_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_members_employee_code ON public.staff_members;
CREATE TRIGGER trg_staff_members_employee_code
BEFORE INSERT ON public.staff_members
FOR EACH ROW EXECUTE FUNCTION public.set_staff_employee_code();