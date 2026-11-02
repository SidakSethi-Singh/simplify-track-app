/**
 * Live verification against the real mock server (not a stub).
 *
 * Run with the mock server up:
 *   cd ../track-api-mock && node server.js     (port 4010)
 *   npm run verify
 *
 * Flow: full sync, then a second sync (incremental changes feed), then
 * compare month totals + transaction count against
 * fixtures/checkpoint.json. Exits non-zero on any mismatch, so CI and
 * humans both get a straight answer. Also proves the retry logic against
 * the server's own failure injection (a 500, a 429, and a 503 per server
 * process) — if retries didn't work, this script would fail.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ApiClient } from '../src/lib/api';
import { SyncStore, Storage } from '../src/lib/store';
import { groupByMonth } from '../src/lib/totals';
import { decimalStringToMinor, formatINR } from '../src/lib/money';

const API_URL = process.env.TRACK_API_URL ?? 'http://localhost:4010';
const CHECKPOINT_PATH =
  process.env.CHECKPOINT_PATH ??
  path.join(__dirname, '..', '..', '..', 'track-api-mock', 'fixtures', 'checkpoint.json');

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => {
      m.set(k, v);
    },
  };
}

async function main() {
  const checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8')) as {
    transaction_count: number;
    months: Record<string, { spend: string; income: string }>;
  };
  const api = new ApiClient(API_URL);
  const store = new SyncStore(memStorage(), api, () => {});
  await store.loadCache();
  console.log(`Syncing from ${API_URL} ...`);
  await store.sync(); // full sync
  console.log(`Full sync done: ${store.snapshot().txns.length} transactions`);
  await store.sync(); // incremental changes feed
  const snap = store.snapshot();
  console.log(`After changes: ${snap.txns.length} transactions (checkpoint: ${checkpoint.transaction_count})`);

  const groups = new Map(groupByMonth(snap.txns).map((g) => [g.key, g]));
  let failures = 0;
  for (const [month, want] of Object.entries(checkpoint.months).sort()) {
    const got = groups.get(month);
    const spend = got ? formatINR(got.spendMinor) : '—';
    const income = got ? formatINR(got.incomeMinor) : '—';
    const ok =
      got &&
      got.spendMinor === decimalStringToMinor(want.spend) &&
      got.incomeMinor === decimalStringToMinor(want.income);
    if (!ok) failures++;
    console.log(
      `${month}  spend ${spend} (want ${want.spend})  income ${income} (want ${want.income})  ${ok ? 'OK' : 'MISMATCH'}`,
    );
  }
  const extra = [...groups.keys()].filter((k) => !checkpoint.months[k]);
  if (extra.length > 0) {
    failures++;
    console.log(`Unexpected extra months: ${extra.join(', ')}`);
  }
  if (snap.txns.length !== checkpoint.transaction_count) {
    failures++;
    console.log(
      `Transaction count mismatch: got ${snap.txns.length}, want ${checkpoint.transaction_count}`,
    );
  }
  if (snap.stats.skipped > 0) {
    console.log(`Note: ${snap.stats.skipped} rows were skipped as unusable (see normalize.ts).`);
  }
  if (failures > 0) {
    console.log(`\nVERIFICATION FAILED (${failures} mismatches)`);
    process.exit(1);
  }
  console.log('\nVERIFICATION PASSED: all months and the transaction count match checkpoint.json');
}

main().catch((e) => {
  console.error('Verification error:', e);
  process.exit(1);
});
