import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTxn, mergeTxns } from '../src/lib/normalize';
import { Account } from '../src/lib/types';

const ACCOUNTS: Account[] = [
  { id: 'acc_4821', bank: 'HDFC Bank', type: 'SAVINGS', last4: '4821', nickname: 'HDFC Savings' },
  { id: 'acc_9075', bank: 'ICICI Bank', type: 'SAVINGS', last4: '9075', nickname: 'ICICI Savings' },
  { id: 'acc_3310', bank: 'HDFC Bank', type: 'CREDIT_CARD', last4: '3310', nickname: 'HDFC Millennia' },
];

test('canonical record passes through unchanged', () => {
  const t = normalizeTxn(
    {
      id: 'txn_1',
      account_id: 'acc_4821',
      occurred_at: '2026-10-09T13:42:00Z',
      direction: 'debit',
      amount_minor: 34900,
      currency: 'INR',
      merchant: 'SWIGGY*BANGALORE',
      category: 'FOOD',
      status: 'POSTED',
      updated_at: '2026-10-09T13:51:00Z',
    },
    ACCOUNTS,
  );
  assert.ok(t);
  assert.equal(t.id, 'txn_1');
  assert.equal(t.accountLabel, 'HDFC Savings');
  assert.equal(t.inrMinor, 34900);
  assert.equal(t.fxConverted, false);
  assert.equal(t.isOwnTransfer, false);
});

test('legacy record maps: last4 account, unix time, string amount, DR/CR', () => {
  const t = normalizeTxn(
    {
      id: '115509',
      account: '4821',
      txn_time: 1774981380,
      amount: '516.49',
      type: 'DR',
      merchant_name: 'BLINKIT',
      category: 'GROCERIES',
      status: 'POSTED',
    },
    ACCOUNTS,
  );
  assert.ok(t);
  assert.equal(t.accountId, 'acc_4821');
  assert.equal(t.direction, 'debit');
  assert.equal(t.amountMinor, 51649);
  assert.equal(t.currency, 'INR');
  assert.equal(t.occurredAt, new Date(1774981380 * 1000).toISOString());
  assert.equal(t.updatedAt, null);
});

test('legacy linked_account marks own transfer; unknown last4 still displays', () => {
  const t = normalizeTxn(
    {
      id: '132083',
      account: '3310',
      txn_time: 1773848160,
      amount: '21579.63',
      type: 'CR',
      merchant_name: 'PAYMENT RECEIVED - THANK YOU',
      category: 'TRANSFER',
      status: 'POSTED',
      linked_account: '9075',
    },
    ACCOUNTS,
  );
  assert.ok(t);
  assert.equal(t.isOwnTransfer, true);
  assert.equal(t.accountId, 'acc_3310');

  const unknown = normalizeTxn(
    {
      id: '999',
      account: '0000',
      txn_time: 1773848160,
      amount: '10.00',
      type: 'DR',
      merchant_name: 'X',
      category: 'FOOD',
      status: 'POSTED',
    },
    ACCOUNTS,
  );
  assert.ok(unknown);
  assert.equal(unknown.accountId, 'legacy:0000');
  assert.equal(unknown.accountLabel, 'Account ••0000');
});

test('canonical counterparty OWN_ACCOUNT marks own transfer', () => {
  const t = normalizeTxn(
    {
      id: 'txn_2',
      account_id: 'acc_9075',
      occurred_at: '2026-10-03T04:44:00Z',
      direction: 'credit',
      amount_minor: 2500000,
      currency: 'INR',
      merchant: 'SELF TRANSFER FROM XX4821',
      category: 'TRANSFER',
      status: 'POSTED',
      updated_at: '2026-10-03T05:54:00Z',
      counterparty: { type: 'OWN_ACCOUNT', account_id: 'acc_4821' },
    },
    ACCOUNTS,
  );
  assert.ok(t);
  assert.equal(t.isOwnTransfer, true);
});

test('FX record converts via fx.inr_minor', () => {
  const t = normalizeTxn(
    {
      id: 'txn_fx',
      account_id: 'acc_3310',
      occurred_at: '2026-10-08T21:45:00Z',
      direction: 'debit',
      amount_minor: 1000,
      currency: 'USD',
      merchant: 'NOTION LABS INC',
      category: 'SUBSCRIPTIONS',
      status: 'POSTED',
      updated_at: '2026-10-08T23:14:00Z',
      fx: { inr_minor: 86661 },
    },
    ACCOUNTS,
  );
  assert.ok(t);
  assert.equal(t.amountMinor, 1000);
  assert.equal(t.inrMinor, 86661);
  assert.equal(t.fxConverted, true);
});

test('FX record without a rate falls back to the raw amount, unflagged', () => {
  const t = normalizeTxn(
    {
      id: 'txn_fx2',
      account_id: 'acc_3310',
      occurred_at: '2026-10-08T21:45:00Z',
      direction: 'debit',
      amount_minor: 1000,
      currency: 'USD',
      merchant: 'X',
      category: 'SUBSCRIPTIONS',
      status: 'POSTED',
      updated_at: '2026-10-08T23:14:00Z',
    },
    ACCOUNTS,
  );
  assert.ok(t);
  assert.equal(t.inrMinor, 1000);
  assert.equal(t.fxConverted, false);
});

test('null category becomes Uncategorized; missing merchant becomes Unknown', () => {
  const t = normalizeTxn(
    {
      id: 'txn_3',
      account_id: 'acc_3310',
      occurred_at: '2026-09-12T04:30:00Z',
      direction: 'debit',
      amount_minor: 247816,
      currency: 'INR',
      category: null,
      status: 'POSTED',
      updated_at: '2026-09-12T05:01:00Z',
    },
    ACCOUNTS,
  );
  assert.ok(t);
  assert.equal(t.category, 'Uncategorized');
  assert.equal(t.merchant, 'Unknown');
});

test('unusable records are dropped, not guessed', () => {
  const base = {
    account_id: 'acc_4821',
    occurred_at: '2026-10-09T13:42:00Z',
    direction: 'debit',
    amount_minor: 100,
    currency: 'INR',
    merchant: 'X',
    category: 'FOOD',
    status: 'POSTED',
  };
  assert.equal(normalizeTxn({ ...base }, ACCOUNTS), null); // no id
  assert.equal(normalizeTxn({ ...base, id: 'a', direction: 'weird' }, ACCOUNTS), null);
  assert.equal(normalizeTxn({ ...base, id: 'a', occurred_at: undefined }, ACCOUNTS), null);
  assert.equal(
    normalizeTxn({ ...base, id: 'a', amount_minor: undefined, amount: 'nope' }, ACCOUNTS),
    null,
  );
  assert.equal(normalizeTxn({ ...base, id: 'a', amount_minor: -5 }, ACCOUNTS), null);
});

test('mergeTxns: boundary duplicate unchanged, newer wins, older ignored', () => {
  const map = new Map();
  const a = normalizeTxn(
    {
      id: 'x',
      account_id: 'acc_4821',
      occurred_at: '2026-10-09T13:42:00Z',
      direction: 'debit',
      amount_minor: 100,
      currency: 'INR',
      merchant: 'X',
      category: 'FOOD',
      status: 'POSTED',
      updated_at: '2026-10-09T13:51:00Z',
    },
    ACCOUNTS,
  )!;
  assert.deepEqual(mergeTxns(map, [a]), { added: 1, updated: 0, unchanged: 0 });
  assert.deepEqual(mergeTxns(map, [a]), { added: 0, updated: 0, unchanged: 1 });
  const newer = { ...a, amountMinor: 200, inrMinor: 200, updatedAt: '2026-10-10T00:00:00Z' };
  assert.deepEqual(mergeTxns(map, [newer]), { added: 0, updated: 1, unchanged: 0 });
  assert.equal(map.get('x').amountMinor, 200);
  assert.deepEqual(mergeTxns(map, [a]), { added: 0, updated: 0, unchanged: 1 });
  assert.equal(map.get('x').amountMinor, 200);
});
