
-- ============================================================================
-- EMPLOYEES TABLE
-- ============================================================================
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  employee_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  cpf TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  role TEXT DEFAULT '',
  base_salary NUMERIC NOT NULL DEFAULT 0,
  hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
  termination_date DATE,
  photo_url TEXT DEFAULT '',
  face_descriptor JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage employees"
  ON public.employees FOR ALL TO authenticated
  USING (admin_owns_store_row(store_id))
  WITH CHECK (admin_owns_store_row(store_id));

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_employees_default_store
  BEFORE INSERT ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_default_store_id();

-- Sequential code generator F0001+
CREATE OR REPLACE FUNCTION public.next_employee_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INT;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(employee_code, '\D', '', 'g'), '')::INT), 0) + 1
  INTO next_num FROM public.employees;
  RETURN 'F' || LPAD(next_num::TEXT, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_employee_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.employee_code IS NULL OR NEW.employee_code = '' THEN
    NEW.employee_code := public.next_employee_code();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_employees_set_code
  BEFORE INSERT ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_employee_code();

-- ============================================================================
-- EMPLOYEE SCHEDULES (dias e horários de trabalho)
-- ============================================================================
CREATE TABLE public.employee_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, day_of_week)
);

ALTER TABLE public.employee_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage schedules"
  ON public.employee_schedules FOR ALL TO authenticated
  USING (admin_owns_store_row(store_id))
  WITH CHECK (admin_owns_store_row(store_id));

CREATE TRIGGER trg_schedules_updated_at
  BEFORE UPDATE ON public.employee_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_schedules_default_store
  BEFORE INSERT ON public.employee_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_default_store_id();

-- ============================================================================
-- TIME CLOCK SETTINGS (configuração global por loja)
-- ============================================================================
CREATE TABLE public.time_clock_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  store_lat NUMERIC,
  store_lng NUMERIC,
  allowed_radius_meters INT NOT NULL DEFAULT 100,
  late_tolerance_minutes INT NOT NULL DEFAULT 10,
  face_match_threshold NUMERIC NOT NULL DEFAULT 0.55,
  require_face_match BOOLEAN NOT NULL DEFAULT true,
  require_geolocation BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.time_clock_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage time clock settings"
  ON public.time_clock_settings FOR ALL TO authenticated
  USING (admin_owns_store_row(store_id))
  WITH CHECK (admin_owns_store_row(store_id));

CREATE TRIGGER trg_clock_settings_updated_at
  BEFORE UPDATE ON public.time_clock_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_clock_settings_default_store
  BEFORE INSERT ON public.time_clock_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_default_store_id();

-- ============================================================================
-- TIME CLOCK PUNCHES (imutável - sem UPDATE/DELETE)
-- ============================================================================
CREATE TABLE public.time_clock_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  punch_type TEXT NOT NULL CHECK (punch_type IN ('in', 'out')),
  punched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  business_day DATE NOT NULL DEFAULT CURRENT_DATE,
  lat NUMERIC,
  lng NUMERIC,
  distance_meters NUMERIC,
  selfie_url TEXT DEFAULT '',
  face_match_score NUMERIC,
  device_info TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_punches_employee_day ON public.time_clock_punches(employee_id, business_day);
CREATE INDEX idx_punches_store_day ON public.time_clock_punches(store_id, business_day);

ALTER TABLE public.time_clock_punches ENABLE ROW LEVEL SECURITY;

-- Apenas SELECT para admins; INSERT só via Edge Function (service role)
CREATE POLICY "Admins can view punches"
  ON public.time_clock_punches FOR SELECT TO authenticated
  USING (admin_owns_store_row(store_id));

-- Sem policies de UPDATE/DELETE = imutável

-- ============================================================================
-- TIME CLOCK OCCURRENCES (imutável)
-- ============================================================================
CREATE TABLE public.time_clock_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  occurrence_type TEXT NOT NULL CHECK (occurrence_type IN ('late', 'absence', 'early_leave', 'no_punch_out', 'irregular')),
  occurrence_date DATE NOT NULL,
  minutes_delta INT DEFAULT 0,
  details TEXT DEFAULT '',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_occurrences_employee ON public.time_clock_occurrences(employee_id, occurrence_date);

ALTER TABLE public.time_clock_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view occurrences"
  ON public.time_clock_occurrences FOR SELECT TO authenticated
  USING (admin_owns_store_row(store_id));

CREATE POLICY "Admins can insert occurrences"
  ON public.time_clock_occurrences FOR INSERT TO authenticated
  WITH CHECK (admin_owns_store_row(store_id));

-- Sem UPDATE/DELETE = imutável

-- ============================================================================
-- OCCURRENCE JUSTIFICATIONS (append-only)
-- ============================================================================
CREATE TABLE public.occurrence_justifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE RESTRICT,
  occurrence_id UUID NOT NULL REFERENCES public.time_clock_occurrences(id) ON DELETE RESTRICT,
  justified_by UUID NOT NULL,
  justification TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'justified' CHECK (status IN ('justified', 'unjustified', 'corrected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.occurrence_justifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view justifications"
  ON public.occurrence_justifications FOR SELECT TO authenticated
  USING (admin_owns_store_row(store_id));

CREATE POLICY "Admins can insert justifications"
  ON public.occurrence_justifications FOR INSERT TO authenticated
  WITH CHECK (admin_owns_store_row(store_id) AND justified_by = auth.uid());

CREATE TRIGGER trg_justifications_default_store
  BEFORE INSERT ON public.occurrence_justifications
  FOR EACH ROW EXECUTE FUNCTION public.set_default_store_id();

-- ============================================================================
-- PAYSLIPS (holerites)
-- ============================================================================
CREATE TABLE public.payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  reference_month INT NOT NULL CHECK (reference_month BETWEEN 1 AND 12),
  reference_year INT NOT NULL CHECK (reference_year >= 2000),
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  pdf_url TEXT NOT NULL,
  notes TEXT DEFAULT '',
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, reference_year, reference_month)
);

CREATE INDEX idx_payslips_employee ON public.payslips(employee_id, reference_year, reference_month);

ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view payslips"
  ON public.payslips FOR SELECT TO authenticated
  USING (admin_owns_store_row(store_id));

CREATE POLICY "Admins can insert payslips"
  ON public.payslips FOR INSERT TO authenticated
  WITH CHECK (admin_owns_store_row(store_id) AND uploaded_by = auth.uid());

-- Sem UPDATE/DELETE = holerite imutável após envio

CREATE TRIGGER trg_payslips_default_store
  BEFORE INSERT ON public.payslips
  FOR EACH ROW EXECUTE FUNCTION public.set_default_store_id();

-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('employee-photos', 'employee-photos', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('clock-selfies', 'clock-selfies', false)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('payslips', 'payslips', false)
  ON CONFLICT (id) DO NOTHING;

-- employee-photos policies (público para leitura)
CREATE POLICY "Anyone can view employee photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'employee-photos');

CREATE POLICY "Admins can upload employee photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employee-photos' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update employee photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'employee-photos' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete employee photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'employee-photos' AND has_role(auth.uid(), 'admin'));

-- clock-selfies policies (privado, apenas admin)
CREATE POLICY "Admins can view clock selfies"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'clock-selfies' AND has_role(auth.uid(), 'admin'));

-- INSERT em clock-selfies via service role (Edge Function)

-- payslips policies (privado, apenas admin via UI; funcionário via Edge Function signed URL)
CREATE POLICY "Admins can view payslips files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payslips' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can upload payslips files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payslips' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete payslips files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'payslips' AND has_role(auth.uid(), 'admin'));
