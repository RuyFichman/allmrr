import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Cookie-free client for public reads inside "use cache" scopes. Runs as `anon`, so RLS applies.
export function createPublicClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
}
