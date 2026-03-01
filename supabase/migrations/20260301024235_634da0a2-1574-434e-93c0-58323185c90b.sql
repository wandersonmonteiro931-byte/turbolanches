
-- Profile changes audit log
CREATE TABLE public.profile_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  user_id uuid NOT NULL,
  changed_by uuid NOT NULL,
  changed_by_role text NOT NULL DEFAULT 'client',
  field_name text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all profile changes"
  ON public.profile_changes FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert profile changes"
  ON public.profile_changes FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own profile changes"
  ON public.profile_changes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert their own changes"
  ON public.profile_changes FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.uid() = changed_by);

-- Allow admins to update and delete profiles
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to manage order_items (for editing orders)
CREATE POLICY "Admins can insert order items"
  ON public.order_items FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update order items"
  ON public.order_items FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete order items"
  ON public.order_items FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Index for faster lookups
CREATE INDEX idx_profile_changes_user_id ON public.profile_changes(user_id);
CREATE INDEX idx_profile_changes_profile_id ON public.profile_changes(profile_id);
