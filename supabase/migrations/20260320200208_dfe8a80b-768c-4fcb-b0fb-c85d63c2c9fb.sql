-- Permitir avaliações em nível de pedido, mesmo quando o item não possui product_id vinculado
ALTER TABLE public.reviews
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_product_id_fkey;

-- Garantir consistência mínima: toda avaliação precisa estar vinculada a um pedido
ALTER TABLE public.reviews
  ALTER COLUMN order_id SET NOT NULL;

-- Índices para leitura do app e painel admin
CREATE INDEX IF NOT EXISTS idx_reviews_order_id_created_at
  ON public.reviews (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_visible_created_at
  ON public.reviews (visible, created_at DESC);