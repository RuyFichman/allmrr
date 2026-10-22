const API_KEY_PATTERN = /(sk|rk|pk)_(live|test)_[A-Za-z0-9]+/g;

// Masks anything that looks like a Stripe API key before it reaches logs or the database.
export function redactSecrets(text: string, credentials: readonly string[] = []) {
  let safe = text;
  // Opaque provider tokens have no reliable pattern; callers can supply the exact secret.
  for (const credential of credentials) {
    if (credential) safe = safe.split(credential).join("[redacted]");
  }
  return safe.replace(API_KEY_PATTERN, "$1_$2_[redacted]")
    .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [redacted]")
    .replace(/((?:access_token|api_key|api-key|authorization)\s*[=:]\s*)[^\s&,;"']+/gi, "$1[redacted]");
}

// Safe one-line message for an unknown thrown value.
export function redactedMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return redactSecrets(message).slice(0, 500);
}
