DELETE FROM public.staff_section_permissions
WHERE staff_member_id IN (
  SELECT sm.id FROM public.staff_members sm
  JOIN public.user_roles ur ON ur.user_id = sm.user_id AND ur.role = 'admin'::public.app_role
  WHERE sm.role <> 'admin'
);

DELETE FROM public.staff_members sm
USING public.user_roles ur
WHERE ur.user_id = sm.user_id
  AND ur.role = 'admin'::public.app_role
  AND sm.role <> 'admin';