/**
 * Normalization: the two wire shapes -> one canonical Txn.
 *
 * Shape A (canonical, ~half the fixtures):
 *   { id: "txn_…", account_id: "acc_4821", occurred_at: ISO, direction,
 *     amount_minor, currency, merchant, category, status, updated_at,
 *     fx?: { inr_minor }, counterparty?: { type: "OWN_ACCOUNT", … } }
 *
 * Shape B (legacy, ~half the fixtures — an older core-banking export):
 *   { id: "115509", account: "4821" (last4), txn_time: unix seconds,
 *     amount: "516.49" (major units, string), type: "DR"|"CR",
 *     merchant_name, category, status, linked_account?: last4 }
 *
 * Rules, each chosen so the result is deterministic on unseen data too:
 * - Identity is the raw id string. Legacy ids are numeric strings; they
 *   never collide with "txn_…" ids, and dedupe is by exact id match.
 * - Direction: DR -> debit, CR -> credit. Anything else -> unusable.
 * - Money: canonical amount_minor is used as-is (integer). Legacy amount
 *   strings go through decimalStringToMinor (exact string math, never
 *   parseFloat). Negative or unparseable amounts -> unusable.
 * - Currency: canonical currency as-is. Legacy rows are always INR.
 * - INR totals: for non-INR rows, fx.inr_minor when present, else the raw
 *   minor amount with fxConverted=false (the UI flags it as approximate).
 * - Own-account transfers: counterparty.type === 'OWN_ACCOUNT' (canonical)
 *   or a present linked_account (legacy). They are kept and displayed but
 *   excluded from spend/income totals.
 * - Account: canonical account_id as-is. Legacy `account` is a last4, so it
 *   is resolved against the accounts list; if no account matches, the row
 *   keeps accountId "legacy:<last4>" and still displays (never dropped
 *   for an account-mapping miss).
 * - occurred_at: canonical ISO as-is; legacy txn_time (unix seconds) ->
 *   ISO. Missing both -> unusable.
 * - Category null/missing -> "Uncategorized". Merchant missing -> "Unknown".
 * - updated_at missing (all legacy rows) -> null, treated as the oldest
 *   possible time so any later change always wins.
 *
 * A record is only dropped when it cannot be identified (no id), cannot be
 * dated, cannot be directed, or has no usable amount — because for those,
 * "exactly once" and "exact money" are impossible. Dropped records are
 * counted in SyncResult.skipped so the loss is visible, never silent.
 */
import { Account, Txn } from './types';
import { decimalStringToMinor } from './money';

type Raw = Record<string, unknown>;

const isRecord = (v: unknown): v is Raw =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asString = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null;

const asInt = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) ? v : null;

export function resolveAccount(
  last4: string,
  accounts: Account[],
): { id: string; label: string } {
  const found = accounts.find((a) => a.last4 === last4);
  if (found) return { id: found.id, label: found.nickname || `${found.bank} ••${found.last4}` };
  return { id: `legacy:${last4}`, label: `Account ••${last4}` };
}

export function accountLabel(accountId: string, accounts: Account[]): string {
  const found = accounts.find((a) => a.id === accountId);
  if (found) return found.nickname || `${found.bank} ••${found.last4}`;
  if (accountId.startsWith('legacy:')) return `Account ••${accountId.slice('legacy:'.length)}`;
  return accountId;
}

/** Normalize one raw record. Returns null when the record is unusable. */
export function normalizeTxn(raw: unknown, accounts: Account[]): Txn | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  if (!id) return null;

  let accountId: string;
  let accountLabelText: string;
  if (asString(raw.account_id)) {
    accountId = raw.account_id as string;
    accountLabelText = accountLabel(accountId, accounts);
  } else if (asString(raw.account)) {
    const r = resolveAccount(raw.account as string, accounts);
    accountId = r.id;
    accountLabelText = r.label;
  } else {
    return null;
  }

  let occurredAt: string | null = null;
  if (asString(raw.occurred_at)) occurredAt = raw.occurred_at as string;
  else if (typeof raw.txn_time === 'number' && Number.isFinite(raw.txn_time)) {
    occurredAt = new Date(raw.txn_time * 1000).toISOString();
  }
  if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) return null;

  let direction: 'debit' | 'credit' | null = null;
  if (raw.direction === 'debit' || raw.direction === 'credit') direction = raw.direction;
  else if (raw.type === 'DR') direction = 'debit';
  else if (raw.type === 'CR') direction = 'credit';
  if (!direction) return null;

  let amountMinor: number | null = null;
  let currency = 'INR';
  if (asInt(raw.amount_minor) !== null) {
    amountMinor = raw.amount_minor as number;
    currency = asString(raw.currency) ?? 'INR';
  } else {
    amountMinor = decimalStringToMinor(raw.amount);
  }
  if (amountMinor === null || amountMinor < 0) return null;

  let inrMinor = amountMinor;
  let fxConverted = false;
  if (currency !== 'INR' && isRecord(raw.fx) && asInt(raw.fx.inr_minor) !== null) {
    inrMinor = raw.fx.inr_minor as number;
    fxConverted = true;
  }

  const counterparty = isRecord(raw.counterparty) ? raw.counterparty : null;
  const isOwnTransfer =
    (counterparty !== null && counterparty.type === 'OWN_ACCOUNT') ||
    asString(raw.linked_account) !== null;

  const updatedAt = asString(raw.updated_at);

  return {
    id,
    accountId,
    accountLabel: accountLabelText,
    occurredAt,
    direction,
    amountMinor,
    currency,
    inrMinor,
    fxConverted,
    merchant: asString(raw.merchant) ?? asString(raw.merchant_name) ?? 'Unknown',
    category: asString(raw.category) ?? 'Uncategorized',
    status: asString(raw.status) ?? 'POSTED',
    updatedAt,
    isOwnTransfer,
  };
}

/**
 * Merge a batch of canonical transactions into a map, newest update wins.
 * Used for both full-sync pages (where the server re-sends the boundary
 * record) and incremental changes. Deletion is handled by the caller.
 */
export function mergeTxns(
  map: Map<string, Txn>,
  batch: Txn[],
): { added: number; updated: number; unchanged: number } {
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const t of batch) {
    const old = map.get(t.id);
    if (!old) {
      map.set(t.id, t);
      added++;
    } else if (
      (t.updatedAt ?? '') > (old.updatedAt ?? '') ||
      (t.updatedAt === old.updatedAt && JSON.stringify(t) !== JSON.stringify(old))
    ) {
      map.set(t.id, t);
      updated++;
    } else {
      unchanged++;
    }
  }
  return { added, updated, unchanged };
}
