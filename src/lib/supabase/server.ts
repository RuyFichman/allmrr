import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "./database.types";

export async function createClient() {
  const cookieStore = await cookies();
  // Session checks (getClaims) read the clock; keep them out of runtime prerenders
  // (Partial Prefetching) so they only run for a real request.
  await connection();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component; the proxy refreshes the session instead.
          }
        },
      },
    }
  );
}
