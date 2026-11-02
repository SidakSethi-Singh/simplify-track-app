/**
 * Month grouping + totals, computed from canonical Txns only.
 *
 * Rules (all verified against the backend's fixtures/checkpoint.json):
 * - Months are Asia/Kolkata calendar months (see money.monthKeyIST).
 * - Spend = sum of inrMinor over debit rows that are NOT own-account
 *   transfers. Income = sum over credit rows that are NOT own-account
 *   transfers. REFUND credits count as income (that is how the backend
 *   checkpoint counts them); see docs/data-decisions.md.
 * - PENDING rows are included in totals (they are real activity; the UI
 *   badges them PENDING). The checkpoint cannot distinguish this case
 *   (no PENDING rows survive the fixture changes feed), so it is a
 *   documented judgment call, not a verified fact.
 * - Foreign-currency rows use fx.inr_minor when the server supplied one.
 * - Everything is integer minor-unit math; formatting happens last.
 */
import { Txn } from './types';
import { monthKeyIST } from './money';

export interface MonthGroup {
  key: string;
  spendMinor: number;
  incomeMinor: number;
  count: number;
  txns: Txn[];
}

export function groupByMonth(txns: Txn[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const t of txns) {
    const key = monthKeyIST(t.occurredAt);
    let g = map.get(key);
    if (!g) {
      g = { key, spendMinor: 0, incomeMinor: 0, count: 0, txns: [] };
      map.set(key, g);
    }
    g.txns.push(t);
    g.count++;
    if (!t.isOwnTransfer) {
      if (t.direction === 'debit') g.spendMinor += t.inrMinor;
      else g.incomeMinor += t.inrMinor;
    }
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.txns.sort((a, b) => {
      if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : -1;
      return a.id < b.id ? -1 : 1;
    });
  }
  groups.sort((a, b) => (a.key < b.key ? 1 : -1));
  return groups;
}

/**
 * Case-insensitive substring search over merchant names (and, as a
 * courtesy, category). Unicode-safe: lowercases both sides. An empty
 * query matches everything.
 */
export function filterBySearch(txns: Txn[], query: string): Txn[] {
  const q = query.trim().toLowerCase();
  if (!q) return txns;
  return txns.filter(
    (t) =>
      t.merchant.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q),
  );
}

export function filterByAccount(txns: Txn[], accountId: string | null): Txn[] {
  if (!accountId) return txns;
  return txns.filter((t) => t.accountId === accountId);
}
