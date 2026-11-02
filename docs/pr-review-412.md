# PR #412 review — "Track: load transactions from the new API"

**Verdict: DO NOT MERGE as the Track implementation. Changes requested.**
The PR is a reasonable loading skeleton, but it breaks eight of the
assignment's non-negotiables. Each comment below is marked BLOCK (must fix
before merge) or LET THROUGH (fine as-is, fix when convenient). Ordered
most important first.

## 1. BLOCK — An error wipes the user's data

`useTransactions.load()` calls `setTransactions([])` in its catch block,
and `TrackScreen` renders only the error text when `error` is set. One
failed page — and this server injects a 500, a 429, and a 503 — destroys
everything the user could already see. Non-negotiable 5 ("a failure never
costs the user what they could already see") is violated by design.

Fix: never clear on error. Keep the last good list, show the error as a
banner, and let the user retry.

## 2. BLOCK — No dedupe: every page boundary duplicates a transaction

The list API's cursor is position-based and re-sends the boundary record
on the next page (`next_cursor` points at `offset + limit - 1`). The PR
appends pages raw (`[...transactions, ...body.items]`), so every page
adds one duplicate. With ~47 pages that is ~47 phantom transactions, and
month counts and totals are wrong. "Every transaction appears exactly
once" fails.

Fix: merge by id (a `Map` keyed by transaction id).

## 3. BLOCK — Stale-closure race drops pages

`load()` closes over the `transactions` state from its render, and
`loadMore` has no in-flight guard, so two overlapping page loads can both
append to the same stale snapshot and silently lose a page. Scrolling
fast (or a slow page, which this server deliberately serves) triggers it.

Fix: serialize loads (an in-flight flag / run id) and merge into a
functional state update or an external store.

## 4. BLOCK — No retry, no backoff, no Retry-After

A 500 or 429 mid-scroll ends the list with a bare error. The server
deliberately returns 500 once, 429 with `Retry-After: 3` once, and 503 on
the first changes request, per process. A production client must retry
with backoff and honor `Retry-After`.

Fix: a fetch wrapper that retries 429/5xx and network failures.

## 5. BLOCK — The second record shape is ignored

Roughly half the data is legacy-shaped: `type: "DR"|"CR"` instead of
`direction`, `amount` as a decimal string instead of `amount_minor`,
`txn_time` (unix seconds) instead of `occurred_at`, and `merchant_name`
instead of `merchant`. The PR reads only canonical fields, so those rows
render with undefined merchant/amount or break grouping. If it looks
fine in a demo, the demo only used canonical rows.

Fix: normalize both shapes to one internal type at the network edge.

## 6. BLOCK — Float money math

`monthTotal` sums `amount_minor / 100` as floats. Floats cannot represent
most decimal amounts exactly, so totals drift by paise — and the
checkpoint comparison (which is exact to the paisa) will fail.

Fix: sum integer minor units; divide by 100 only when formatting.

## 7. BLOCK — Own-account transfers counted as spend and income

`TRANSFER` rows (counterparty `OWN_ACCOUNT`, or legacy `linked_account`)
are money moving between the user's own accounts. The PR counts them in
`monthTotal`, inflating both spend and income (e.g. a ₹25,000 self
transfer appears as ₹25,000 spent AND ₹25,000 earned). Non-negotiable 4
and the backend checkpoint both exclude them.

Fix: flag own transfers at normalization and exclude them from totals
(but still display them).

## 8. BLOCK — Currency ignored, wrong locale

`formatAmount` hardcodes `₹` and `en-US` grouping, so a USD 10.00
subscription renders as ₹10.00, and Indian grouping (₹1,23,456.78) is
never used. The API serves USD rows with an `fx.inr_minor` conversion
that the PR never reads.

Fix: use `fx.inr_minor` for INR totals when present, show the original
currency alongside, and format with `en-IN`.

## 9. LET THROUGH — `keyExtractor` uses the row index

Index keys break list recycling and state when rows are inserted,
deleted, or updated (exactly what the changes feed does). Use the
transaction id. Not merge-blocking on its own, but a one-line fix — do
it with the dedupe fix.

## 10. LET THROUGH — Month header shows spend only, and the label can shift

The header shows only spent (no earned, no count), and
`new Date("2026-10")` parses as UTC midnight, so the label can render
the wrong month in some timezones. Also: no search, no detail screen, no
offline cache, no incremental sync — fine for a first cut, but this PR
should not be presented as the Track screen until the BLOCK items land.

---

## How this submission avoids each problem

| PR #412 problem | This app |
|---|---|
| Error wipes list | `store.ts`: failures leave the map and token untouched; banner only |
| Boundary duplicates | `mergeTxns` dedupes by id everywhere |
| Stale-closure race | Run-id guard; one sync at a time, newer supersedes older |
| No retry | `api.ts`: retries 429/5xx + network, honors `Retry-After` |
| Legacy shape ignored | `normalize.ts`: both shapes -> one canonical type |
| Float money | `money.ts`: integer minor units until formatting |
| Own transfers counted | `isOwnTransfer` flag excluded from totals |
| Currency ignored | `fx.inr_minor` used; original currency shown; `en-IN` grouping |
| Index keys | `keyExtractor` is the transaction id |
| Header/timezone | Header shows spent + earned + count; IST month keys |
