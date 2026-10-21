# Security: revenue provider credentials

AllMRR verifies revenue with **read-only restricted API keys** that founders create in their
payment provider. This page describes how those keys are handled.

## What we accept

- Stripe **restricted keys** only: `rk_live_…`. `rk_test_…` is accepted only when
  `ALLOW_STRIPE_TEST_KEYS=true` (development).
- Secret keys (`sk_…`) and publishable keys (`pk_…`) are rejected before any API call. We never
  want write access to a founder's account.
- Keys are validated with read-only `list` calls (`limit: 1`). We never probe write endpoints.

## Encryption at rest

- Algorithm: AES-256-GCM (`node:crypto`), implemented in `src/lib/crypto/secrets.ts`.
- Key: `REVENUE_ENCRYPTION_KEY`, 32 random bytes, base64. The app refuses to encrypt or decrypt
  if it is missing or has the wrong length. Generate one with:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```

- Format: `v<keyVersion>:<iv_b64>:<tag_b64>:<ciphertext_b64>`, with a random 12-byte IV per
  encryption.
- The connection id is the AAD (additional authenticated data). A ciphertext copied to another
  `revenue_connections` row fails authentication and cannot be decrypted.

## Where plaintext exists

- Decryption happens only in server-only sync code (`src/lib/revenue/sync.ts`), modules marked
  with `import "server-only"`.
- The plaintext key is never returned to the browser, logged, cached, or included in error
  messages. Anything matching `(sk|rk|pk)_(live|test)_…` is redacted before it is logged or stored
  in `last_error` / `sync_runs.error`.
- Only `key_last4` is stored in clear, so founders can recognize the key.

## Database access

- `revenue_connections.encrypted_credentials` has no column grant for `anon` or `authenticated`;
  any client query that selects it fails with `permission denied`. Founders can read the other
  metadata columns of their own connections through RLS.
- All writes to connections, snapshots, `fx_rates` and `sync_runs` go through the service-role
  client in `src/lib/supabase/admin.ts`, after a server-side check that the user is a founder of
  the startup. `SUPABASE_SECRET_KEY` is a server-only environment variable.
- **Disconnect** sets `encrypted_credentials = null` (enforced by a check constraint together with
  `disconnected_at`). Historical snapshots stay; the startup loses its Verified status.
- One live connection per provider account: a unique index on
  `(provider, external_account_id)` stops one Stripe account from verifying two startups. The
  account id is only known when the key can read it (see the Stripe permission list in the app).

## Abuse limits

Connect attempts (5 per hour) and manual syncs (1 per 10 minutes) are counted per user and startup
in `private.rate_limit_events`, through the service-role-only `consume_rate_limit` function.

## Rotating the encryption key

Ciphertexts carry their key version, so old and new keys can coexist during a rotation.

1. Generate a new key (command above).
2. In every environment, move the current key to a versioned variable and install the new one:
   - `REVENUE_ENCRYPTION_KEY_V1` = the old value of `REVENUE_ENCRYPTION_KEY`
   - `REVENUE_ENCRYPTION_KEY` = the new key
   - `REVENUE_ENCRYPTION_KEY_VERSION` = `2`
3. Deploy. New connections are written as `v2:`; existing `v1:` values still decrypt with
   `REVENUE_ENCRYPTION_KEY_V1`.
4. Re-encrypt existing rows: ask each founder to reconnect, or run a one-off server script that
   decrypts each `v1:` value with its connection id and writes `encryptSecret(...)` back, updating
   `key_version`.
5. When `select count(*) from revenue_connections where key_version < 2 and encrypted_credentials is not null`
   returns 0, remove `REVENUE_ENCRYPTION_KEY_V1`.

If a key is believed to be compromised, rotate it and also ask founders to roll their Stripe
restricted keys, because an attacker with the database and the old key could decrypt them.
