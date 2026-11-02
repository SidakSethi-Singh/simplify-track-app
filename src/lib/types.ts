/**
 * Canonical transaction type used everywhere in the app.
 *
 * Everything the UI or totals code touches is a Txn. The two wire shapes
 * (canonical + legacy, see normalize.ts) are converted to this at the edge
 * and never leak further.
 */
export type Direction = 'debit' | 'credit';

export interface Txn {
  /** Stable id from the server. The only identity used for dedupe. */
  id: string;
  /** Account id in canonical form, e.g. "acc_4821". */
  accountId: string;
  /** Human label for the account (nickname, or last4 fallback). */
  accountLabel: string;
  /** ISO 8601 UTC timestamp of when the transaction occurred. */
  occurredAt: string;
  direction: Direction;
  /** Amount in the transaction's own currency, minor units (integer). */
  amountMinor: number;
  /** Original currency, e.g. "INR" or "USD". */
  currency: string;
  /**
   * Amount in INR minor units. For INR transactions this equals amountMinor.
   * For foreign-currency transactions this is fx.inr_minor when the server
   * supplied one, otherwise amountMinor (flagged by `fxConverted: false`).
   * All month totals use this field, so totals are always INR.
   */
  inrMinor: number;
  /** True when inrMinor came from the server's fx.inr_minor conversion. */
  fxConverted: boolean;
  merchant: string;
  /** Never null in a Txn; null on the wire becomes "Uncategorized". */
  category: string;
  status: string;
  /** ISO 8601 UTC timestamp of last update, or null for legacy rows. */
  updatedAt: string | null;
  /**
   * True when the money moved between the user's own accounts
   * (counterparty.type === 'OWN_ACCOUNT', or legacy linked_account).
   * Such transactions are shown but never counted as spending or earning.
   */
  isOwnTransfer: boolean;
}

export interface Account {
  id: string;
  bank: string;
  type: string;
  last4: string;
  nickname: string;
}
