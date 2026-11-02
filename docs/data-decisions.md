# What the data made you decide

Evidence record from studying the mock server and fixtures. Every claim
below was checked against the data or against `fixtures/checkpoint.json`
(`npm run verify` reproduces the check). This is a build log, not the
decision log — Sidak's judgment entries live in `decision-log.md`.

## 1. Two record shapes, not one

~2,394 rows are canonical (`direction`, `amount_minor`, `occurred_at`,
`merchant`); ~2,281 rows are a legacy core-banking export (`type: DR/CR`,
`amount` as a decimal string, `txn_time` unix seconds, `merchant_name`).
Decision: normalize both to one canonical type at the network edge
(`normalize.ts`). Nothing downstream ever sees the legacy shape.

## 2. Months are IST calendar months

The two 2025-09-30 UTC-evening rows (a ₹614.28 Blinkit debit and a
₹2,42,333 salary credit) land in 2025-10 IST, and the checkpoint has no
2025-09 month at all. Grouping by UTC months fails verification; grouping
by Asia/Kolkata months matches exactly. Decision: `monthKeyIST`, with a
fixed +5:30 fallback for devices with minimal ICU data (IST has no DST,
so the fallback is exact).

## 3. Own-account transfers are neither spend nor income

50 final rows move money between the user's own accounts (canonical
`counterparty.type === 'OWN_ACCOUNT'`, legacy `linked_account`). The
checkpoint excludes them — including them breaks every month's totals.
Decision: flag them (`isOwnTransfer`), display them with a note, exclude
them from spend/income. The matched pair (₹25,000 out of HDFC Savings,
₹25,000 into ICICI Savings, minutes apart) confirmed the pattern.

## 4. Foreign currency uses the server's conversion

15 USD subscription rows (Notion, Apple, ChatGPT) carry `fx.inr_minor`.
Using the raw USD minor amounts as rupees breaks October's totals;
using `fx.inr_minor` matches exactly. Decision: INR totals use
`fx.inr_minor` when present; the detail screen still shows the original
currency. If a future row has no rate, the raw amount is used and flagged
as approximate rather than dropped.

## 5. REFUND credits count as income (checkpoint semantics)

19 `REFUND` credits (e.g. Amazon Pay refunds) are counted as income by
the backend checkpoint, not as negative spend — treating them as
negative spend breaks 9 months' verification. Decision: follow the
checkpoint. (A real product might net refunds against spend; that would
be a product decision to revisit with the team, and it would need the
checkpoint to change too.)

## 6. PENDING rows: included, badged (judgment call, NOT verified)

After the changes feed, zero PENDING rows survive in the fixtures, so
the checkpoint cannot tell us how pending rows should count. Decision:
include them in totals (they are real activity) and badge them PENDING
in the UI. If the backend disagrees, this is the one totals rule to
revisit first.

## 7. The spikes are real, not bugs

- April 2026 income (₹14,79,390.89) is a ₹12,34,567.89 bonus plus salary.
- February 2026 spend (₹4,43,341.40) is a ₹1,84,500 Tanishq jewellery
  purchase. Both were verified row by row, not smoothed away.

## 8. The server re-sends the boundary record

`/v1/transactions` cursors point at `offset + limit - 1`, so each next
page repeats the previous page's last row. Decision: dedupe by id on
every merge. The changes feed's cursors do NOT overlap
(`offset + limit`) — handled separately, same dedupe as a safety net.

## 9. The server fails on purpose

Per server process: one 500 on a list request, one 429 with
`Retry-After: 3`, one 503 on the first changes request, plus one 4.2s
slow page. Decision: retry 429/5xx and network errors with backoff,
honor `Retry-After`, and never let a failure touch cached data. The live
verification run proves this end to end (it completed against a fresh
server that injected all three failures).

## 10. Small data notes

- Amounts are never negative or zero in the fixtures (min ₹0.50), but
  the normalizer still rejects negatives rather than guessing.
- 3 rows have `category: null` → shown as "Uncategorized".
- Merchant names include Hindi (`राम किराना स्टोर`), emoji
  (`☕ Third Wave Coffee`), and UPI handles — search lowercases both
  sides and never assumes ASCII.
- The list feed is perfectly newest-first sorted in the fixtures, but
  the app re-sorts defensively (occurred_at desc, id tiebreak) so an
  unseen-data ordering surprise can't scramble the UI.
- Legacy `account` values are last4s; all three resolve to known
  accounts here. An unmatched last4 keeps the row visible under
  `legacy:<last4>` instead of being dropped.
- The changes feed only ever sends canonical-shaped rows (verified).
