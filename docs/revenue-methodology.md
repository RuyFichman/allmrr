# How AllMRR calculates revenue

Every number marked **Verified** on AllMRR comes straight from the founder's payment provider
through a read-only API key. Founders can't type or edit these numbers. This page explains exactly
how we compute them, so they can be compared across startups.

All amounts are shown in **US dollars**. Days are UTC days.

## Monthly Recurring Revenue (MRR)

MRR is the recurring revenue a startup earns per month from its active subscriptions, today.

**Subscriptions we count**
- `active`
- `past_due`: the customer is still subscribed while the payment is retried.
- Subscriptions set to cancel at the end of the period still count until they actually end.

**Subscriptions we exclude**
- `trialing`: no money has been paid yet.
- `incomplete` and `incomplete_expired`: the first payment never succeeded.
- `unpaid`, `paused` and `canceled`.

**How each subscription is valued**
1. Each item is worth its price times its quantity. Tiered prices are computed with Stripe's
   graduated or volume rules, and "transform quantity" (packages) is respected.
2. The amount is converted to a monthly figure:
   - yearly: ÷ 12
   - monthly: ÷ 1
   - weekly: × 52 ÷ 12
   - daily: × 365.25 ÷ 12

   Then it is divided by the interval count, so a price billed every 3 months is ÷ 3.
3. Active discounts are applied: percentage and fixed-amount coupons, on the whole subscription or
   on a single item. A coupon stops counting when it ends (`repeating` coupons have an end date).
   One-time (`once`) coupons only affect a single invoice, so they don't change MRR.
4. Taxes are not part of MRR. We use pre-tax prices; prices configured as tax-inclusive can't be
   split by us and are counted as-is.
5. **Usage-based (metered) items are left out of MRR**, because their amount isn't known in advance.
   The money they bring in still counts in total revenue.
6. Each subscription is converted to USD with the latest daily exchange rate, and the total is
   rounded to the cent only at the very end.

## Total revenue

Total revenue is the all-time sum of money actually received:

- **plus** successful payments (charges),
- **minus** refunds,
- **minus** disputes (chargebacks). A dispute the startup later wins is added back.

It is **gross of payment processing fees**: Stripe's fees are not subtracted. It comes from Stripe
balance transactions, which are already in the account's settlement currency. Each one is converted
to USD at the exchange rate of the day it happened.

## 30-day growth

`(MRR today − MRR 30 days ago) ÷ MRR 30 days ago`. When there was no MRR 30 days ago, growth is not
shown, because a percentage of zero is meaningless.

## History before a startup joined

When a founder connects Stripe, we rebuild the past:

- **Revenue history is exact.** We read every historical balance transaction.
- **MRR history is estimated** for up to 24 months. We replay each subscription's start, trial and
  end dates using its current prices. Upgrades, downgrades and old discounts from the past can't be
  recovered, so those days are flagged as estimated.
- From the day of the connection on, MRR is recorded every day as it actually was.

## Exchange rates

We use the daily reference rates published by the European Central Bank (via the Frankfurter API).
On weekends and holidays we use the most recent previous rate.

## When a startup is "Verified"

A startup is verified while at least one connected payment account synced successfully in the last
72 hours. Data syncs automatically every day. If a key is revoked, a sync keeps failing, or the
founder disconnects, the badge disappears, and its revenue stops being shown publicly.

## What we never do

- We only accept **restricted, read-only** keys. AllMRR can't charge, refund or change anything.
- Keys are encrypted at rest and never shown back, even to the founder (only the last 4 characters).
- One Stripe account can verify only one startup (when the key can read the account id).

## Sprint 3 provider research

### Lemon Squeezy — deferred by the owner (2026-10-22)

The official [API setup guide](https://docs.lemonsqueezy.com/guides/developer-guide/getting-started)
and [authentication reference](https://docs.lemonsqueezy.com/api/getting-started/requests)
describe Bearer API keys, but do not document read-only scopes or a scoped OAuth alternative.
The documented credential is also used for [canceling subscriptions](https://docs.lemonsqueezy.com/api/subscriptions/cancel-subscription).
We therefore cannot establish that the credential meets AllMRR's read-only requirement.
The owner approved deferring this provider on 2026-10-22 while preserving the read-only requirement.
No adapter or credential acceptance is enabled. Revisit only when an officially supported
restricted-access mechanism can be confirmed.

Documented basics: keys expire after one year; test and live keys access their respective data.
Read-only authentication can be checked with `GET /v1/users/me`, but a successful GET does not prove
the absence of write permissions. List pagination uses `page[number]` and `page[size]` (maximum 100).
The [API reference](https://docs.lemonsqueezy.com/api) states a limit of 300 requests per minute.
Minimum read scopes, reliable key-mode detection and the account/store identity boundary remain
unresolved. Subscription/transaction mapping, gross-versus-net reconciliation, refund history and
incremental filtering must be researched before any future implementation; no assumptions are made here.

### Polar — research complete enough to identify a history-contract decision (2026-10-22)

No adapter is enabled yet. Read-only credentials exist; the unresolved issue is the exact daily
revenue history promised by this methodology, not the availability of scoped access.

#### Authentication and validation

[Organization Access Tokens](https://polar.sh/docs/integrate/oat) are Bearer credentials scoped to
one organization. Create a token in Organization Settings → Developers → New Token, select only
the required read scopes and set an expiry. The candidate public-read scope set is
`organizations:read`, `subscriptions:read`, `orders:read`, `refunds:read`, `disputes:read` and
`payments:read`. Price and discount data are embedded in subscriptions; separate product/discount
permissions would only be necessary if implementation adds those calls.

Read probes would use `GET /v1/organizations/`, `/v1/subscriptions/`, `/v1/orders/`,
`/v1/refunds/`, `/v1/disputes/` and `/v1/payments/`, each with `limit=1`. Verify that exactly one
organization is accessible and use its UUID as `external_account_id` (namespace sandbox IDs).
These calls establish readable resources, not absence of extra write scopes. The documented
[OAuth introspection](https://polar.sh/docs/api-reference/oauth2/connect/introspect-token)
requires an OAuth client ID and secret; do not treat it as an OAT self-inspection API.
Never use write probes. Do not accept a knowingly overprivileged token.

#### API contract and normalized data

Pin `Polar-Version: 2026-10`, per [versioning](https://polar.sh/docs/api-reference/versioning).
The [subscription list](https://polar.sh/docs/api-reference/subscriptions/list) exposes status,
currency, interval/count, start/trial/end dates, cancellation-at-period-end, enabled prices,
discounts, seats, units and meters. Status names map directly to our eight normalized statuses;
unrecognized statuses must fail closed. Recurring usage remains excluded from MRR.

The official [subscription model](https://github.com/polarsource/polar/blob/main/server/polar/models/subscription.py)
calculates `amount` after the discount. Applying that discount again would undercount MRR.
The API does not expose the model's `discount_applied_at`; repeating-discount expiry cannot safely
be derived from the discount's redemption window. `starts_at`/`ends_at` on a discount describe
when it may be redeemed, not when it stops reducing an existing subscription. One-time discounts
must still be excluded from MRR, requiring the undiscounted recurring price calculation.

[Orders](https://polar.sh/docs/api-reference/orders/list) have integer amounts in cents and an
explicit currency. `net_amount` is after discounts and before tax, not net of platform fees;
`total_amount` includes tax. `platform_fee_amount` is separate. Applied customer balance can
also make the invoice amount differ from new cash received. Do not equate an invoice total with
a payment without reconciling this distinction.

[Refunds](https://polar.sh/docs/api-reference/refunds/list) include amount, tax, currency and
status; only successful refunds affect revenue. A linked dispute may represent prevention via
refund, which must not be subtracted twice. The official
[dispute implementation](https://github.com/polarsource/polar/blob/main/server/polar/dispute/service.py)
separately records ordinary resolved disputes and prevention refunds: listing refunds alone is
not complete chargeback coverage. Payments and disputes have public read routes in the
[official payment source](https://github.com/polarsource/polar/blob/main/server/polar/payment/endpoints.py)
and [dispute source](https://github.com/polarsource/polar/blob/main/server/polar/dispute/endpoints.py).

#### Pagination, incremental reads and exact-history limitation

Lists use `page` and `limit` (maximum 100), with `pagination.max_page`. The documented order and
refund lists do not offer a general modified-since event feed. A pending refund can succeed or
fail later, including outside our three-day rewind. Filtering mutable objects by creation date
would therefore miss changes to earlier snapshots.

Public order/refund/dispute shapes expose `created_at`, `modified_at` and current status, not a
complete timestamped history of cash movements or all status transitions. `modified_at` is not
a settlement or dispute-resolution timestamp. Assigning it that meaning would invent accuracy.
The official [transaction routes](https://github.com/polarsource/polar/blob/main/server/polar/transaction/endpoints.py)
provide `GET /v1/transactions/search` and `/export`, but explicitly mark them `APITag.private`.
Source availability does not establish a supported public API contract. No private route has
been called and no approximation has been implemented.

The [transaction authentication source](https://github.com/polarsource/polar/blob/main/server/polar/transaction/auth.py)
also restricts `transactions:read` to a `User` subject, excluding organization tokens. Adding this
scope to an OAT cannot solve the history gap. A user-authorized OAuth integration would need separate
client registration, appropriate read-only consent, account isolation and confirmation that Polar
supports the ledger route for that integration.

**Owner decision pending:** defer Polar until a supported read-only ledger/export can be confirmed,
or investigate a user-authorized read-only OAuth integration with Polar's confirmation of ledger
support. Revising the historical-revenue contract would be a separate product decision, not an
implementation shortcut. Neither a full-access token nor an OAT with extra write scopes is an option.

#### Rate limits and sandbox preparation

The [API overview](https://polar.sh/docs/api-reference/introduction) documents 500 requests/minute
in production and 100/minute in sandbox, with HTTP 429 and `Retry-After`. Use bounded retries and
defer work rather than retrying early.

The [sandbox guide](https://polar.sh/docs/integrate/sandbox) describes separate users, organizations
and tokens at `https://sandbox.polar.sh`, using `https://sandbox-api.polar.sh` for the API.
Production uses `https://api.polar.sh`. A `polar_oat_` prefix alone does not establish the environment;
select and validate the environment explicitly, and require `ALLOW_POLAR_TEST_KEYS=true` for sandbox.

After resolving the contract, prepare acceptance testing as follows:
1. Create a dedicated account and organization at `https://sandbox.polar.sh`.
2. Create monthly and annual test products; complete checkout using the documented test card
   `4242 4242 4242 4242`, a future expiry and any test CVC.
3. Add trial, canceled-at-period-end, discount and partial-refund scenarios through the sandbox UI.
4. Create an expiring token in Settings → Developers → New Token using only the finalized read
   scopes. Do not create a token yet: the final minimum scopes depend on the approved data source.
5. Supply that token locally through an ignored environment file when requested, never in a commit.
6. Compare AllMRR results with the sandbox dashboard, record any methodology differences, then
   disconnect, revoke the token and remove the temporary test data after the approved dev run.
