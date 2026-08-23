// Configuração do Supabase para Vite, Lovable e Cloudflare.
// A URL e a chave anon/publicável podem permanecer no frontend.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { brokeredPreviewStorage } from './previewAuthStorage';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://kyoyfsxgqmlxwtnmtbuh.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5b3lmc3hncW1seHd0bm10YnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTQyNDQsImV4cCI6MjA4NzQ3MDI0NH0.MPUhmTlh4EyH-ALeBgdlN8bphen6c6Lopt87EE7qShc';

export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: brokeredPreviewStorage(),
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
