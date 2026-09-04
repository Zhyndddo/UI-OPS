import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY. Uses the service role key, which must never reach the
// browser — only import this file from app/api/**/route.js (Next.js
// Route Handlers always run server-side) or other server code, never
// from a "use client" component.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

// Verifies the caller's access token (sent from the client in the
// Authorization header) and returns their profile row, or null if
// invalid/missing. Every admin API route uses this before doing anything
// — never trust a client-supplied role or profile id directly.
export async function getCallerProfile(request) {
  if (!supabaseAdmin) return null;
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("auth_id", userData.user.id)
    .maybeSingle();
  return profile || null;
}
