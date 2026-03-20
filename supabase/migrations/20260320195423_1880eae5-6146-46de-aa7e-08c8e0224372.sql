
-- Change default for visible to false (reviews hidden until admin approves)
ALTER TABLE public.reviews ALTER COLUMN visible SET DEFAULT false;
