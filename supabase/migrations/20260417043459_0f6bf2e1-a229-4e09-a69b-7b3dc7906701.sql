-- Create a default "Turbo Lanches" store and link it to the existing admin
DO $$
DECLARE
  v_admin_id uuid := '216bb294-d399-445d-a43c-b7fdcc89e63d';
  v_store_id uuid;
BEGIN
  INSERT INTO public.stores (name, slug, active, owner_user_id, whatsapp_name)
  VALUES ('Turbo Lanches', 'turbolanches', true, v_admin_id, 'Turbo Lanches')
  RETURNING id INTO v_store_id;

  -- Link admin role to this store
  UPDATE public.user_roles
  SET store_id = v_store_id
  WHERE user_id = v_admin_id AND role = 'admin';
END $$;