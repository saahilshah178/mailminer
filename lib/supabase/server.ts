import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Anon-key Supabase client bound to the request cookie store.
 * For App Router server components / route handlers. Subject to RLS.
 *
 * Note: in this project we authenticate via Auth.js (not Supabase Auth), so
 * RLS uses `auth.uid()` only when a Supabase JWT is present. Server-side
 * trusted writes go through `getSupabaseAdmin()` instead.
 */
export function getSupabaseServer() {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server component context can't set cookies; safe to ignore.
        }
      },
    },
  });
}
