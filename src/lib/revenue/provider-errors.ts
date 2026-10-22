export class ProviderAuthError extends Error {
  constructor() { super("The provider rejected the credential. Reconnect with a new read-only credential."); }
}

export class ProviderPermissionError extends Error {
  constructor() { super("The credential is missing a required read permission."); }
}

export class ProviderRateLimitError extends Error {
  constructor(readonly retryAfterMs: number) { super("The provider rate limit was reached. Sync will be retried later."); }
}

export class ProviderUnreachableError extends Error {
  constructor() { super("The provider could not complete the request. Try again later."); }
}
