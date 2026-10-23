"use server";

import { randomUUID } from "node:crypto";
import { updateTag } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { encryptSecret, assertEncryptionConfigured } from "@/lib/crypto/secrets";
import { redactedMessage } from "@/lib/crypto/redact";
import { TAGS } from "@/lib/data/cache-tags";
import { stripeProvider } from "@/lib/revenue/providers/stripe";
import { keyLast4 } from "@/lib/revenue/providers/stripe-mapping";
import { syncConnection } from "@/lib/revenue/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type RevenueActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  missing?: string[];
};

const CONNECT_LIMIT = { max: 5, windowSeconds: 60 * 60 };
const SYNC_LIMIT = { max: 1, windowSeconds: 10 * 60 };

const connectSchema = z.object({
  key: z.string().trim().min(1, "Paste your restricted key.").max(255, "That key is too long."),
});

// Every action re-checks identity and ownership on the server: the user must be a
// founder of the startup. Writes then go through the service role.
async function requireFounder(startupId: string) {
  if (!z.uuid().safeParse(startupId).success) return null;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return null;

  const { data: membership } = await supabase
    .from("startup_founders")
    .select("startup:startups!inner (id, slug)")
    .eq("startup_id", startupId)
    .eq("profile_id", userId)
    .maybeSingle();
  return membership ? { userId, slug: membership.startup.slug } : null;
}

async function withinLimit(userId: string, action: string, startupId: string, limit: { max: number; windowSeconds: number }) {
  const { data, error } = await createAdminClient().rpc("consume_rate_limit", {
    p_user_id: userId,
    p_action: action,
    p_subject_id: startupId,
    p_max: limit.max,
    p_window_seconds: limit.windowSeconds,
  });
  if (error) throw new Error(`Rate limit check failed: ${error.message}`);
  return data;
}

export async function connectStripe(
  startupId: string,
  _prev: RevenueActionState,
  formData: FormData
): Promise<RevenueActionState> {
  const founder = await requireFounder(startupId);
  if (!founder) return { error: "You can only connect revenue for your own startups." };

  const parsed = connectSchema.safeParse({ key: formData.get("key") });
  if (!parsed.success) return { error: z.flattenError(parsed.error).fieldErrors.key?.[0] };

  if (!(await withinLimit(founder.userId, "stripe_connect", startupId, CONNECT_LIMIT))) {
    return { error: "Too many connection attempts. Try again in an hour." };
  }

  try {
    assertEncryptionConfigured();
  } catch {
    console.error("[connect] REVENUE_ENCRYPTION_KEY is missing or invalid");
    return { error: "Revenue connections are temporarily unavailable. Please try again later." };
  }

  const key = parsed.data.key;
  let validation;
  try {
    validation = await stripeProvider.validateCredentials(key);
  } catch (error) {
    return { error: `Couldn't validate the key: ${redactedMessage(error)}` };
  }
  if (!validation.ok) return { error: validation.message, missing: validation.missing };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("revenue_connections")
    .select("id, external_account_id")
    .eq("startup_id", startupId)
    .eq("provider", "stripe")
    .maybeSingle();

  if (validation.accountId) {
    const { data: claimed } = await admin
      .from("revenue_connections")
      .select("id")
      .eq("provider", "stripe")
      .eq("external_account_id", validation.accountId)
      .is("disconnected_at", null)
      .neq("startup_id", startupId)
      .limit(1);
    if (claimed?.length) return { error: "This Stripe account already verifies another startup on AllMRR." };
  }

  // The row id is the AAD, so it must exist before encrypting.
  const connectionId = existing?.id ?? randomUUID();
  const { ciphertext, keyVersion } = encryptSecret(key, connectionId);

  // A rotation for the same account must preserve observed MRR and financial history.
  if (existing && !existing.external_account_id) {
    return { error: "The original Stripe account identity is unknown. Contact support before reconnecting so historical revenue is not mixed between accounts." };
  }
  if (existing && (!validation.accountId || existing.external_account_id !== validation.accountId)) {
    return { error: "Reconnect the original Stripe account with Core → Accounts: Read enabled." };
  }

  const { error } = await admin.from("revenue_connections").upsert({
    id: connectionId,
    startup_id: startupId,
    provider: "stripe",
    status: "active",
    encrypted_credentials: ciphertext,
    key_version: keyVersion,
    key_last4: keyLast4(key),
    external_account_id: validation.accountId,
    disconnected_at: null,
    last_error: null,
    consecutive_failures: 0,
    last_sync_started_at: null,
    last_synced_at: null,
    last_success_at: null,
  });
  if (error) {
    if (error.code === "23505") return { error: "This Stripe account already verifies another startup on AllMRR." };
    return { error: "We couldn't save the connection. Please try again." };
  }

  // The first sync (full backfill) runs after the response is sent.
  after(async () => {
    await syncConnection(connectionId, "connect");
  });

  updateTag(TAGS.startup(founder.slug));
  return {
    ok: true,
    message: validation.missingOptional.length
      ? "Connected. Syncing your revenue now. Add Core → Accounts: Read to lock this Stripe account to your startup."
      : "Connected. Syncing your revenue now.",
  };
}

export async function syncStripeNow(startupId: string): Promise<RevenueActionState> {
  const founder = await requireFounder(startupId);
  if (!founder) return { error: "You can only sync your own startups." };

  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("revenue_connections")
    .select("id")
    .eq("startup_id", startupId)
    .eq("provider", "stripe")
    .is("disconnected_at", null)
    .maybeSingle();
  if (!connection) return { error: "Connect Stripe first." };

  if (!(await withinLimit(founder.userId, "stripe_sync", startupId, SYNC_LIMIT))) {
    return { error: "You can sync once every 10 minutes. The daily sync also runs automatically." };
  }

  after(async () => {
    await syncConnection(connection.id, "manual");
  });
  return { ok: true, message: "Sync started." };
}

export async function disconnectStripe(startupId: string): Promise<RevenueActionState> {
  const founder = await requireFounder(startupId);
  if (!founder) return { error: "You can only disconnect your own startups." };

  const admin = createAdminClient();
  // Wipes the ciphertext for good; snapshots stay as history.
  const { data, error } = await admin
    .from("revenue_connections")
    .update({
      encrypted_credentials: null,
      key_version: null,
      disconnected_at: new Date().toISOString(),
      status: "revoked",
      last_sync_started_at: null,
    })
    .eq("startup_id", startupId)
    .eq("provider", "stripe")
    .is("disconnected_at", null)
    .select("id");
  if (error) return { error: "We couldn't disconnect Stripe. Please try again." };
  if (!data.length) return { error: "Stripe is not connected." };

  await admin.rpc("refresh_startup_revenue", { p_startup_id: startupId });
  updateTag(TAGS.startups);
  updateTag(TAGS.startup(founder.slug));
  return { ok: true, message: "Stripe disconnected. Your stored key was deleted." };
}
