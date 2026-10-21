import { createHash, timingSafeEqual } from "node:crypto";
import { redactedMessage } from "@/lib/crypto/redact";
import { syncDueConnections } from "@/lib/revenue/sync";

// Hobby allows 300s; leave headroom so the last syncs can finish and report.
export const maxDuration = 300;
const BUDGET_MS = 240_000;

// Constant-time compare on fixed-length digests, so length differences don't leak either.
function isAuthorized(header: string | null, secret: string) {
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const received = createHash("sha256").update(header ?? "").digest();
  return timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !isAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncDueConnections({ budgetMs: BUDGET_MS });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error(`[cron] sync-revenue failed: ${redactedMessage(error)}`);
    return Response.json({ ok: false, error: redactedMessage(error) }, { status: 500 });
  }
}
