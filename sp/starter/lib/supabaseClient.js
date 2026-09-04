import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Deliberately not throwing here — the page itself reports missing env
// vars as a visible checkmark instead of a crash, so it's obvious what's
// wrong from the deployed page rather than needing to read build logs.
export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
