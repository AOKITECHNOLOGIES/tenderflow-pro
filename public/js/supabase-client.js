// ============================================================================
// TenderFlow Pro — Supabase Client
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = window.__ENV__?.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.__ENV__?.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[TenderFlow] Missing Supabase credentials. Check your .env configuration.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// ── Session helpers ─────────────────────────────────────────────────────────

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error('[Auth] getUser error:', error.message);
    return null;
  }
  return user;
}

export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*, companies(id, name, slug, logo_url, ai_enabled, is_active)')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('[Auth] getProfile error:', error.message);
    return null;
  }
  return data;
}

export default supabase;
