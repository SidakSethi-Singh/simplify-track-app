import test from 'node:test';
import assert from 'node:assert/strict';
import { groupByMonth, filterBySearch, filterByAccount } from '../src/lib/totals';
import { Txn } from '../src/lib/types';

function txn(over: Partial<Txn> & { id: string }): Txn {
  return {
    accountId: 'acc_4821',
    accountLabel: 'HDFC Savings',
    occurredAt: '2026-10-09T13:42:00Z',
    direction: 'debit',
    amountMinor: 1000,
    currency: 'INR',
    inrMinor: 1000,
    fxConverted: false,
    merchant: 'SHOP',
    category: 'SHOPPING',
    status: 'POSTED',
    updatedAt: null,
    isOwnTransfer: false,
    ...over,
  };
}

test('groupByMonth: IST months, own transfers excluded, FX converted', () => {
  const txns = [
    txn({ id: '1', occurredAt: '2025-09-30T19:15:00Z', direction: 'debit', amountMinor: 61428, inrMinor: 61428 }), // Oct IST
    txn({ id: '2', occurredAt: '2025-09-30T19:15:00Z', direction: 'credit', amountMinor: 24233300, inrMinor: 24233300 }),
    txn({ id: '3', occurredAt: '2026-10-03T04:42:00Z', direction: 'debit', amountMinor: 2500000, inrMinor: 2500000, isOwnTransfer: true }),
    txn({ id: '4', occurredAt: '2026-10-03T04:44:00Z', direction: 'credit', amountMinor: 2500000, inrMinor: 2500000, isOwnTransfer: true }),
    txn({ id: '5', occurredAt: '2026-10-08T21:45:00Z', direction: 'debit', amountMinor: 1000, inrMinor: 86661, currency: 'USD', fxConverted: true }),
    txn({ id: '6', occurredAt: '2026-10-08T06:45:00Z', direction: 'credit', amountMinor: 233300, inrMinor: 233300, category: 'REFUND' }),
  ];
  const groups = groupByMonth(txns);
  assert.equal(groups.length, 2);
  const oct25 = groups.find((g) => g.key === '2025-10')!;
  assert.equal(oct25.spendMinor, 61428);
  assert.equal(oct25.incomeMinor, 24233300);
  const oct26 = groups.find((g) => g.key === '2026-10')!;
  // Own transfers excluded; FX debit converted; REFUND credit counts as income.
  assert.equal(oct26.spendMinor, 86661);
  assert.equal(oct26.incomeMinor, 233300);
  assert.equal(oct26.count, 4);
  assert.equal(groups[0].key, '2026-10'); // newest month first
});

test('filterBySearch: case-insensitive, unicode-safe, matches merchant or category', () => {
  const txns = [
    txn({ id: '1', merchant: 'SWIGGY*BANGALORE' }),
    txn({ id: '2', merchant: 'राम किराना स्टोर' }),
    txn({ id: '3', merchant: '☕ Third Wave Coffee', category: 'FOOD' }),
  ];
  assert.equal(filterBySearch(txns, 'swiggy').length, 1);
  assert.equal(filterBySearch(txns, 'किराना').length, 1);
  assert.equal(filterBySearch(txns, 'coffee').length, 1);
  assert.equal(filterBySearch(txns, 'FOOD').length, 1);
  assert.equal(filterBySearch(txns, '').length, 3);
  assert.equal(filterBySearch(txns, 'zzz').length, 0);
});

test('filterByAccount', () => {
  const txns = [txn({ id: '1' }), txn({ id: '2', accountId: 'acc_9075' })];
  assert.equal(filterByAccount(txns, null).length, 2);
  assert.equal(filterByAccount(txns, 'acc_9075').length, 1);
});
