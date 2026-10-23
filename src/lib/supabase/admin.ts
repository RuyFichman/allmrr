import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Service-role client: bypasses RLS. Only for server-side sync code and for writes that
// follow an explicit ownership check. Never import it from client components.
export function createAdminClient(deadline?: number) {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is not set.");

  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(deadline ? { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("The sync time budget was reached.");
      const timeout = AbortSignal.timeout(Math.max(1, Math.min(15_000, remaining)));
      return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
    } } } : {}),
  });
}

export type AdminClient = ReturnType<typeof createAdminClient>;
