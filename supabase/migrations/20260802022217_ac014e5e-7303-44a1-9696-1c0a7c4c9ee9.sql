CREATE OR REPLACE FUNCTION public.list_switchable_staff_accounts()
RETURNS TABLE (
  id uuid,
  role text,
  display_name text,
  employee_code text,
  username text,
  email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.user_id = auth.uid() AND sm.is_active = true)
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT sm.id, sm.role, sm.display_name, sm.employee_code, sm.username, sm.email
  FROM public.staff_members sm
  WHERE sm.is_active = true
  ORDER BY sm.role, sm.display_name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_switchable_staff_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_switchable_staff_accounts() TO authenticated;