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
