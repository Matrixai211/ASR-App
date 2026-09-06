import { createClient } from '@supabase/supabase-js';

export const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET || 'asr-media';

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server storage is not configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
