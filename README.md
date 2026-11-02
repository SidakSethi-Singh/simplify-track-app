# Track — Simplify Money Frontend Engineer Intern assignment

A React Native (Expo) rebuild of the Simplify Money **Track** screen: every
transaction across the user's bank accounts and cards, month by month, built
against the provided mock API — and built to survive the real network and
real-shaped data, not just the fixtures.

## Run it in under 5 minutes

You need Node 18+ and the Expo Go app on an Android phone (or an Android
emulator).

```bash
# 1. Start the mock API (in the sibling repo — never edit it, never open
#    issues/PRs against it):
cd ../track-api-mock
node server.js
# Track API mock on http://0.0.0.0:4010

# 2. In a second terminal, start this app:
cd ../track-app
npm install
EXPO_PUBLIC_API_URL=http://<your-computer's-LAN-IP>:4010 npx expo start
```

Then open the app from the QR code in **Expo Go**. (On a real phone,
`localhost` means the phone itself, so the LAN IP is required. On an
Android emulator, `http://10.0.2.2:4010` works. The app also has a
**Server settings** section at the bottom of the Track screen where the
URL can be changed without restarting, plus a **Reset local data**
button.)

One documented command runs the app against the mock server:

```bash
EXPO_PUBLIC_API_URL=http://<LAN-IP>:4010 npx expo start
```

## What it does

- **All transactions, month by month**, newest first, with that month's
  spent and earned totals and transaction count.
- **Search** by merchant (case-insensitive, works for Hindi/emoji merchant
  names too) and **filter** by account.
- **Transaction detail**: everything the API knows — original amount and
  currency, INR conversion where the server supplied a rate, category,
  status, account, timestamps, and a note when money moved between the
  user's own accounts.
- **Offline-first**: synced data is persisted locally. If the network or
  server fails, the app keeps showing the last good data with a banner —
  a failure never costs the user what they could already see.
- **Incremental sync**: after the first full sync, pull-to-refresh fetches
  only changes via `sync_token`. It survives being killed mid-sync
  (progress is saved after every page), expired tokens (automatic full
  re-sync on HTTP 410), and racing syncs (a newer run supersedes an older
  one). The newest update always wins, by `updated_at`.
- **Exact money**: all math is integer minor units until display; Indian
  digit grouping (₹1,23,456.78); months are Asia/Kolkata calendar months.
- **Exactly once**: dedupe by transaction id everywhere — the list API
  re-sends the boundary record on every page, and re-fetched change pages
  overlap after a failure. Both are collapsed.
- **Smooth scrolling**: windowed `SectionList` over the full history
  (4,686 transactions in the fixtures).

## Verify the numbers

```bash
# With the mock server running on :4010:
npm run verify
```

This runs a full sync plus the changes feed against the live server and
compares every month's spend/income and the transaction count against
`../track-api-mock/fixtures/checkpoint.json`. All 13 months and the
4,686-transaction count match exactly.

Unit tests (pure logic: money, normalization, sync engine, totals, API
retries):

```bash
npm test        # 24 tests
npm run typecheck
```

## Project layout

```
src/app/            Expo Router screens: index (Track list), detail
src/lib/
  api.ts            Retrying API client (429/5xx, Retry-After, backoff)
  normalize.ts      Two wire shapes -> one canonical transaction
  money.ts          Integer minor-unit math, INR formatting, IST months
  store.ts          Sync engine + persisted cache (AsyncStorage)
  totals.ts         Month grouping, totals, search, account filter
  syncContext.tsx   React glue: one store per server URL
  types.ts          Canonical transaction type
tests/              node:test suites for the pure logic
scripts/            Live checkpoint verification against the mock server
docs/
  pr-review-412.md  Task 3: review of the teammate's PR #412
  data-decisions.md What the data forced us to decide (with evidence)
  decision-log.md   TODO-SIDAK: judgment entries for Sidak to write
  ai-disclosure.md  AI assistance disclosure (incl. one real AI mistake)
  unfinished.md     What is not done, and why
```

## What this submission does NOT contain (yet)

See `docs/unfinished.md`. In short: the Android build link (no Android
SDK here — use the Expo Go path above), the walkthrough video, Task 0
(app referrals + friend feedback), and the Task 1 teardown all need
Sidak's phone, friends, and judgment. Nothing about those is faked here.
