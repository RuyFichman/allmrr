# Security: revenue provider credentials

AllMRR verifies revenue with **read-only restricted API keys** that founders create in their
payment provider. This page describes how those keys are handled.

## What we accept

- Stripe **restricted keys** only: `rk_live_…`. `rk_test_…` is accepted only when
  `ALLOW_STRIPE_TEST_KEYS=true` (development).
- Secret keys (`sk_…`) and publishable keys (`pk_…`) are rejected before any API call. We never
  want write access to a founder's account.
- Keys are validated with read-only `list` calls (`limit: 1`). We never probe write endpoints.

## Sprint 3: Lemon Squeezy deferred

Research on 2026-10-22 found no documented read-only scopes or scoped OAuth flow in the official
[key creation guide](https://docs.lemonsqueezy.com/guides/developer-guide/getting-started)
and [authentication reference](https://docs.lemonsqueezy.com/api/getting-started/requests).
The API also allows subscription cancellation with a Bearer key. Restricting our HTTP helper to
GET would limit our code, not the credential's authority if stolen. We do not accept, store or
request these keys while this requirement is unresolved. Test mode isolates test data but does not
make a credential read-only. The owner approved deferral on 2026-10-22. Confirm a supported
restricted credential before revisiting the integration; never validate access with write probes.

## Sprint 3: Polar deferred

Polar supports [scoped Organization Access Tokens](https://polar.sh/docs/integrate/oat).
Use only the minimum read scopes for the approved data source, never `:write` scopes. The candidate
public API scopes and read probes are recorded in `docs/revenue-methodology.md`; they are not yet
implemented. A successful GET proves read access but cannot establish that a token has no additional
write permissions. Do not use private token-management endpoints or mutation probes to check this.

OATs use Bearer authentication and the `polar_oat_` prefix. This prefix does not distinguish live
from sandbox; the API hosts and credentials are isolated. Any future adapter must explicitly
validate the selected environment and gate sandbox with `ALLOW_POLAR_TEST_KEYS=true`. Redact the
whole OAT, encrypt it with the connection ID as AAD, and never retain raw provider errors.

No token has been requested, stored or used. The owner deferred implementation on 2026-10-22 to
preserve historical data accuracy: the financial ledger routes found in Polar's official source are marked
private. Do not silently depend on them or substitute mutable order timestamps for financial events.
Their authentication also permits user subjects only, not OATs. Investigating a user-authorized
OAuth integration requires separate client registration and confirmation of supported ledger access;
extra OAT scopes or full-access credentials are not a workaround.

## Sprint 3: Paddle, RevenueCat and Gumroad deferred

The owner deferred these adapters on 2026-10-22 to preserve exact historical revenue. None is
registered or accepts credentials. Research and the remaining data limitations are recorded in
`docs/revenue-methodology.md`; no keys were requested or retained.

- Paddle: modern scoped Bearer keys only; legacy keys are not restricted. Candidate grants are
  `subscription.read`, `transaction.read`, `adjustment.read`, `discount.read`. GET `/` can verify
  account, environment and granted scopes. Reject write grants. `report.read` cannot generate
  reports; do not add `report.write` to work around history gaps. The owner declined a separate
  dashboard-report workflow.
- RevenueCat: V2 secret keys with only the documented `:read` permissions for projects, customers,
  subscriptions and purchases. Reject V1/public SDK keys and `:read_write` grants. Select and
  validate sandbox explicitly; keys do not themselves isolate the environment.
- Gumroad: scoped OAuth with `view_profile`, `view_sales`, `view_payouts` is the candidate access
  model. Do not accept the broad `account` scope or mutation grants. Avoid token query parameters,
  email-producing exports and write probes. No financial sandbox credential scheme was confirmed.

Before enabling any adapter, add its credential patterns and exact-token redaction tests. Opaque
tokens require exact-token redaction, not just a guessed prefix. Raw responses and native error
messages must not escape the server-only adapter. Keep encryption/AAD and founder authorization
identical to the existing connection workflow.

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

## Failure handling and reconnects

Provider authentication and permission failures produce fixed, credential-free messages. Revoked
keys require attention immediately; two consecutive hard failures trigger the dashboard alert.
Rate limits do not increment that counter. Their retry time is persisted and respected by manual
and cron syncs, with bounded jittered retries inside the execution deadline. There are no emails.

Rotating a key for the same known Stripe account retains its historical snapshots. A different
account, a missing account ID on the new key, or an unknown original identity is rejected rather
than combining financial histories. Enable Core → Accounts: Read when reconnecting. Existing
connections without a recorded account identity need an identity recovery workflow before rotation.

Local UI checks cover the alert, reconnect form, accessible authorization error and two-step
disconnect at 375px. Authenticated dev integration checks remain pending Supabase access; these
local checks do not establish provider sandbox acceptance.

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
