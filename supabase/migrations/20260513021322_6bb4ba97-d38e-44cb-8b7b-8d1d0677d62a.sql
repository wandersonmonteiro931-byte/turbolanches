
-- Lock down courier_locations: only admins can read/write directly. 
-- Anonymous courier portal will use a secure edge function instead.
DROP POLICY IF EXISTS "Anyone can insert courier locations" ON public.courier_locations;
DROP POLICY IF EXISTS "Anyone can update courier locations" ON public.courier_locations;
DROP POLICY IF EXISTS "Anyone can view courier locations" ON public.courier_locations;

CREATE POLICY "Admins manage courier locations"
ON public.courier_locations
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Restrict site_content public read to exclude the admin password row
DROP POLICY IF EXISTS "Anyone can view site content" ON public.site_content;

CREATE POLICY "Public can view non-sensitive site content"
ON public.site_content
FOR SELECT
USING (key <> 'admin_section_password');
