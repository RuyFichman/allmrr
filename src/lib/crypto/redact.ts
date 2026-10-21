const API_KEY_PATTERN = /(sk|rk|pk)_(live|test)_[A-Za-z0-9]+/g;

// Masks anything that looks like a Stripe API key before it reaches logs or the database.
export function redactSecrets(text: string) {
  return text.replace(API_KEY_PATTERN, "$1_$2_[redacted]");
}

// Safe one-line message for an unknown thrown value.
export function redactedMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return redactSecrets(message).slice(0, 500);
}
