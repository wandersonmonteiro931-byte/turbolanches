CREATE TABLE IF NOT EXISTS public.staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'seller', 'cashier')),
  display_name text NOT NULL,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_section_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_member_id uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  section_path text NOT NULL,
  can_access boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_member_id, section_path)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_members TO authenticated;
GRANT ALL ON public.staff_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_section_permissions TO authenticated;
GRANT ALL ON public.staff_section_permissions TO service_role;

CREATE INDEX IF NOT EXISTS idx_staff_members_store_id ON public.staff_members(store_id);
CREATE INDEX IF NOT EXISTS idx_staff_members_user_id ON public.staff_members(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_permissions_member ON public.staff_section_permissions(staff_member_id);

CREATE OR REPLACE FUNCTION public.touch_staff_member_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_members_updated_at ON public.staff_members;
CREATE TRIGGER trg_staff_members_updated_at
BEFORE UPDATE ON public.staff_members
FOR EACH ROW EXECUTE FUNCTION public.touch_staff_member_updated_at();

CREATE OR REPLACE FUNCTION public.has_staff_section_access(_user_id uuid, _section_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role = 'admin'::public.app_role
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.staff_members sm WHERE sm.user_id = _user_id
    ) THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.staff_members sm
      JOIN public.staff_section_permissions sp ON sp.staff_member_id = sm.id
      WHERE sm.user_id = _user_id
        AND sm.is_active = true
        AND sp.section_path = _section_path
        AND sp.can_access = true
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_staff_section_access(_user_id, '/admin/administradores');
$$;

GRANT EXECUTE ON FUNCTION public.has_staff_section_access(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_staff(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND (
        _role <> 'admin'::public.app_role
        OR NOT EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.user_id = _user_id)
        OR EXISTS (
          SELECT 1
          FROM public.staff_members sm
          WHERE sm.user_id = _user_id
            AND sm.is_active = true
        )
      )
  );
$$;

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_section_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view own membership" ON public.staff_members;
CREATE POLICY "Staff can view own membership"
ON public.staff_members FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.can_manage_staff(auth.uid()));

DROP POLICY IF EXISTS "Authorized admins manage staff" ON public.staff_members;
CREATE POLICY "Authorized admins manage staff"
ON public.staff_members FOR ALL TO authenticated
USING (public.can_manage_staff(auth.uid()))
WITH CHECK (public.can_manage_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can view own permissions" ON public.staff_section_permissions;
CREATE POLICY "Staff can view own permissions"
ON public.staff_section_permissions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.id = staff_member_id
      AND sm.user_id = auth.uid()
  )
  OR public.can_manage_staff(auth.uid())
);

DROP POLICY IF EXISTS "Authorized admins manage permissions" ON public.staff_section_permissions;
CREATE POLICY "Authorized admins manage permissions"
ON public.staff_section_permissions FOR ALL TO authenticated
USING (public.can_manage_staff(auth.uid()))
WITH CHECK (public.can_manage_staff(auth.uid()));