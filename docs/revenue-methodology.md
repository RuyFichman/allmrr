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

### Polar — deferred by the owner (2026-10-22)

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

The owner deferred Polar until a supported read-only source can preserve exact revenue history.
Neither a full-access token nor an OAT with extra write scopes is a workaround.

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

### Paddle Billing — deferred by the owner (2026-10-22)

Read-only access is supported, but the owner deferred Paddle until exact history is available
through the API. A separate dashboard-generated report workflow was considered and declined.
No adapter is enabled and no credential has been requested.

#### Authentication and read contract

The [authentication guide](https://developer.paddle.com/api-reference/about/authentication/)
documents Bearer keys beginning `pdl_live_apikey_` or `pdl_sdbx_apikey_`. Legacy 50-character keys
have no scoped permissions and must be rejected. Create keys in My account → Settings →
Authentication → API keys, with only the permissions listed below and an expiry.

Candidate minimum scopes are `subscription.read`, `transaction.read`, `adjustment.read` and
`discount.read`. [GET /](https://developer.paddle.com/api-reference/api-root/get-api-root/) returns
`caller.permissions`, `caller.account.id` (a stable `slr_` identifier) and `api.environment`.
Require an authenticated account, reject write permissions and validate the expected environment.
Use the account ID with an environment namespace for sandbox. Probe each collection with GET and
`per_page=1`; never create a transaction or refund to validate a key.

#### Data and history assessment

- [Subscriptions](https://developer.paddle.com/api-reference/subscriptions/list-subscriptions/):
  `GET /subscriptions`, up to 200/page. Statuses `active`, `past_due`, `trialing`, `paused`,
  `canceled` map to the same normalized names. `scheduled_change.action=cancel` keeps MRR until
  cancellation. Items expose quantity, trial dates, recurring prices, interval and frequency.
  Prices are minor-unit integer strings, with a currency and country overrides; selecting an
  arbitrary price override would be incorrect.
- [Discounts](https://developer.paddle.com/api-reference/discounts/get-discount/): GET by ID;
  percentage, flat and flat-per-seat amounts, currency, recurrence and product/price restrictions.
  Subscription discount application dates differ from a discount's redemption expiry. One-off
  discounts must not reduce MRR; restricted flat discounts need allocation only to eligible items.
- [Transactions](https://developer.paddle.com/api-reference/transactions/list-transactions/):
  `GET /transactions`, maximum 30/page; creation/update/billed date filtering. Payment attempts
  expose `captured_at`, status and minor-unit amount. Invoice totals can include credits and are
  not a substitute for captured payments. Currency, taxes, fees and payout totals are separate.
  Gross revenue must not be confused with `earnings` after Paddle fees.
- [Adjustments](https://developer.paddle.com/api-reference/adjustments/list-adjustments/):
  `GET /adjustments`, maximum 50/page; refunds, credits, chargebacks and reversals. Pending and
  rejected refunds do not move revenue. Credits against unpaid invoices are not cash refunds.
  Lists use `after` and `meta.pagination.next/has_more`; adjustment lists have no general
  modified-since parameter, so creation-only incremental filtering would miss later approvals.

The [adjustment lifecycle](https://developer.paddle.com/webhooks/adjustments/adjustment-updated/)
documents approval transitions, but it is not a settlement ledger. The
[financial report](https://developer.paddle.com/build/reports/adjustments/) distinguishes
`created_at`, `updated_at`, `approved_at` and `balance_updated_at`. The list API contract exposes
only the first two. Do not silently equate an entity update with the date it affected the balance.
Reports can be read with `report.read`; generating them requires `report.write`, which is not an
acceptable credential permission. A retained event feed is also not a complete all-time ledger.

#### Limits and sandbox

[Rate limits](https://developer.paddle.com/api-reference/about/rate-limiting/) are normally 240
requests/minute per IP, with HTTP 429 and `Retry-After`. API hosts are `api.paddle.com` and
`sandbox-api.paddle.com`; sandbox must require `ALLOW_PADDLE_TEST_KEYS=true`.
For future acceptance, create a dedicated sandbox account, monthly/annual products and purchases,
then request refunds through its dashboard (sandbox approvals run every ten minutes). Create an
expiring sandbox API key with only the final read scopes after the history source is resolved.
No full-access key or paid self-purchase is needed.

### RevenueCat — deferred by the owner (2026-10-22)

The owner deferred this provider to preserve exact historical revenue. Read-only keys exist;
the limitation is the underlying financial data, including events that RevenueCat never receives.

#### Authentication, identity and reads

[API v2](https://www.revenuecat.com/docs/api-v2) uses Bearer secret keys created in project settings
→ API keys → New → V2. V1 and public SDK keys are not substitutes. Candidate minimum scopes are:

- `project_configuration:projects:read` for `GET /v2/projects` and the stable project ID.
- `customer_information:customers:read` for the project's customers and customer events.
- `customer_information:subscriptions:read` for customer subscriptions and subscription transactions.
- `customer_information:purchases:read` for customer one-time purchases.

Product configuration would additionally require `project_configuration:products:read` if used to
resolve intervals; final minimum scopes depend on a supported financial source. Probe GET lists
with `limit=1`, never grant entitlements, change subscriptions or refund purchases. Use one project
per connection and namespace sandbox identity; do not use an app user ID as an account ID.

[Customer resources](https://www.revenuecat.com/docs/api-v2/customer/resources) expose subscriptions,
purchases and events under `/projects/{project_id}/customers/{customer_id}`. Project-level
subscription/purchase search requires a known store identifier; it is not an all-history list.
Paginate with `starting_after` and `next_page`, up to 100/page. These resource lists do not provide
a general changed-since ledger; customer aliases and transferred purchases need deduplication.

#### Mapping and accuracy limits

The [subscription schema](https://www.revenuecat.com/docs/api-v2/subscription-data-model) distinguishes
`active`, `trialing`, `expired`, `in_grace_period`, `in_billing_retry`, `paused`, `unknown` and
`incomplete`. A future mapping would use `past_due` for grace/retry, `canceled` for expired,
and fail closed on unknown states. Access alone is not proof of payment. Renewal status carries
cancellation intent; store product duration and actual transaction prices must resolve cadence,
discounts and trials. Indicative catalog prices are not actual recurring charges.

[Subscription transactions](https://www.revenuecat.com/docs/api-v2/subscription-transactions) are
documented for App Store and Play Store, with purchase timestamps and decimal major-unit revenue
in local currency and USD. `gross`, `tax`, `commission` and `proceeds` are distinct. AllMRR would
use gross local amounts, converted by its own FX table, not proceeds or RevenueCat's USD estimate.
The response is not a complete dated refund/chargeback ledger.

The [refund guide](https://www.revenuecat.com/docs/subscription-guidance/refunds) explicitly documents
undetected Google refunds without revocation and Amazon refunds, plus store-specific limitations.
Reading more pages or subscribing to events cannot recover events that were never detected.
[Scheduled exports](https://www.revenuecat.com/docs/integrations/scheduled-data-exports) are not a
complete solution: imported Google history can be absent; historical prices can be inaccurate;
`refunded_at` is detection time and excludes some App Store upgrade partial refunds. Current
post-refund totals must not be backdated to the original charge or presented as exact history.

#### Limits and sandbox

Customer-information reads default to 480 requests/minute; project configuration to 60/minute,
with 429 and `Retry-After`. Resources have an explicit production/sandbox environment; a secret
key prefix does not isolate test data. A future adapter must filter and check every returned
environment and gate sandbox with `ALLOW_REVENUECAT_TEST_KEYS=true`.
[Sandbox testing](https://www.revenuecat.com/docs/test-and-launch/sandbox) supports platform
sandboxes and Test Store. Future acceptance needs a dedicated project, actual store sandbox
subscriptions, renewals and refunds, then a V2 read-only key. Test Store alone does not prove
App Store/Play Store financial-history coverage. No credentials were requested.

### Gumroad — deferred by the owner (2026-10-22)

The owner deferred this provider to preserve exact history. Research included the
[official API](https://gumroad.com/api) and its public documentation/source because the documentation
page renders in JavaScript. No authenticated API calls were made.

#### Authentication and read contract

The [documented scopes](https://github.com/antiwork/gumroad/blob/main/app/javascript/components/ApiDocumentation/Scopes.tsx)
include `view_profile` (public profile/products), `view_sales` (sales/subscribers) and `view_payouts`
(payout details). These are the candidate minimum set. Reject `account`, `edit_products`,
`edit_sales`, `refund_sales` and other mutation grants. A scoped OAuth authorization is preferable
to accepting a dashboard token whose grants have not been established. Token prefixes do not
identify live versus test. Never place access tokens in logged URLs or error messages.

Read validation would use `GET /v2/user`, `/v2/products`, `/v2/sales` and `/v2/payouts`.
The user's stable ID, not email or product ID, is the connection identity. A successful GET alone
does not prove the absence of write grants. Do not invoke sales-export endpoints (they queue
delivery emails), register callbacks or perform refund probes.

#### Data and history assessment

The [sales implementation](https://github.com/antiwork/gumroad/blob/main/app/controllers/api/v2/sales_controller.rb)
uses `page_key` pagination (10/page); `after`/`before` filter sale creation dates, not later refunds.
The [subscriber API](https://github.com/antiwork/gumroad/blob/main/app/javascript/components/ApiDocumentation/Endpoints/Subscribers.tsx)
uses product subscriber lists and individual subscriber reads. It exposes recurrence, start,
trial/end/failure/cancellation dates and status. `alive` and pending cancellation would count;
pending failure requires distinguishing grace from terminated payment; terminated states do not
count. Historical terminated subscriptions cannot be assumed present in active product lists.
Actual recurring amount, quantity and discount duration must be established before mapping MRR;
using the latest discounted purchase or today's product price would not establish that contract.

The [sale serializer](https://github.com/antiwork/gumroad/blob/main/app/models/purchase.rb) returns
canonical USD cents for `price` and `gumroad_fee`, while displayed currency and buyer presentment
can differ. Do not multiply canonical USD amounts by the displayed currency's exchange rate.
Refund/dispute booleans describe current state, not the amounts and dates of every transition.
Fees, taxes and shipping are separate; payout `net_total` is not gross revenue.

We also investigated the stronger alternative:
[payout details](https://github.com/antiwork/gumroad/blob/main/app/javascript/components/ApiDocumentation/Endpoints/Payouts.tsx)
with `include_transactions=true`, including upcoming payouts. Rows contain daily sale/refund/
chargeback data in decimal amounts. However, the
[export implementation](https://github.com/antiwork/gumroad/blob/main/app/services/exports/payouts/base.rb)
has a legacy missing-refund-transaction fallback limited to a single full refund. Unreconciled
differences become `Technical Adjustment` rows at a payout-period date. These cannot identify
the original financial event or its date; generic `Credit` rows also need semantic reconciliation.
Thus this is not evidence of complete exact history for every account. A future adapter must
establish coverage and reject ambiguous data, never silently count these differences as revenue.

#### Limits and testing

No stable general public API quota was established in the reviewed reference; the official
rate-limiter source includes endpoint-specific limits. Honor 429/`Retry-After`, use bounded
backoff and avoid assuming a numeric global quota.
The [test-purchase guide](https://gumroad.com/help/article/62-testing-a-purchase) uses a creator
logged into their own product checkout and the Test card option. These purchases do not charge
money or appear as ordinary audience sales. A 100% coupon is another checkout test, not a paid
financial-ledger fixture. No isolated sandbox financial account/key was established. Do not use
paid self-purchases as an acceptance workaround. Before requesting any future credential, resolve
both exact-history coverage and a provider-supported financial sandbox test procedure.
