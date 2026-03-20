
CREATE TABLE public.ai_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'user',
  content text NOT NULL,
  actions text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage their own AI chat messages"
ON public.ai_chat_messages
FOR ALL
TO authenticated
USING (auth.uid() = user_id AND has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = user_id AND has_role(auth.uid(), 'admin'));

CREATE INDEX idx_ai_chat_messages_user_id ON public.ai_chat_messages(user_id, created_at DESC);
