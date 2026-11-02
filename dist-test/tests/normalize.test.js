"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const normalize_1 = require("../src/lib/normalize");
const ACCOUNTS = [
    { id: 'acc_4821', bank: 'HDFC Bank', type: 'SAVINGS', last4: '4821', nickname: 'HDFC Savings' },
    { id: 'acc_9075', bank: 'ICICI Bank', type: 'SAVINGS', last4: '9075', nickname: 'ICICI Savings' },
    { id: 'acc_3310', bank: 'HDFC Bank', type: 'CREDIT_CARD', last4: '3310', nickname: 'HDFC Millennia' },
];
(0, node_test_1.default)('canonical record passes through unchanged', () => {
    const t = (0, normalize_1.normalizeTxn)({
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
    }, ACCOUNTS);
    strict_1.default.ok(t);
    strict_1.default.equal(t.id, 'txn_1');
    strict_1.default.equal(t.accountLabel, 'HDFC Savings');
    strict_1.default.equal(t.inrMinor, 34900);
    strict_1.default.equal(t.fxConverted, false);
    strict_1.default.equal(t.isOwnTransfer, false);
});
(0, node_test_1.default)('legacy record maps: last4 account, unix time, string amount, DR/CR', () => {
    const t = (0, normalize_1.normalizeTxn)({
        id: '115509',
        account: '4821',
        txn_time: 1774981380,
        amount: '516.49',
        type: 'DR',
        merchant_name: 'BLINKIT',
        category: 'GROCERIES',
        status: 'POSTED',
    }, ACCOUNTS);
    strict_1.default.ok(t);
    strict_1.default.equal(t.accountId, 'acc_4821');
    strict_1.default.equal(t.direction, 'debit');
    strict_1.default.equal(t.amountMinor, 51649);
    strict_1.default.equal(t.currency, 'INR');
    strict_1.default.equal(t.occurredAt, new Date(1774981380 * 1000).toISOString());
    strict_1.default.equal(t.updatedAt, null);
});
(0, node_test_1.default)('legacy linked_account marks own transfer; unknown last4 still displays', () => {
    const t = (0, normalize_1.normalizeTxn)({
        id: '132083',
        account: '3310',
        txn_time: 1773848160,
        amount: '21579.63',
        type: 'CR',
        merchant_name: 'PAYMENT RECEIVED - THANK YOU',
        category: 'TRANSFER',
        status: 'POSTED',
        linked_account: '9075',
    }, ACCOUNTS);
    strict_1.default.ok(t);
    strict_1.default.equal(t.isOwnTransfer, true);
    strict_1.default.equal(t.accountId, 'acc_3310');
    const unknown = (0, normalize_1.normalizeTxn)({
        id: '999',
        account: '0000',
        txn_time: 1773848160,
        amount: '10.00',
        type: 'DR',
        merchant_name: 'X',
        category: 'FOOD',
        status: 'POSTED',
    }, ACCOUNTS);
    strict_1.default.ok(unknown);
    strict_1.default.equal(unknown.accountId, 'legacy:0000');
    strict_1.default.equal(unknown.accountLabel, 'Account ••0000');
});
(0, node_test_1.default)('canonical counterparty OWN_ACCOUNT marks own transfer', () => {
    const t = (0, normalize_1.normalizeTxn)({
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
    }, ACCOUNTS);
    strict_1.default.ok(t);
    strict_1.default.equal(t.isOwnTransfer, true);
});
(0, node_test_1.default)('FX record converts via fx.inr_minor', () => {
    const t = (0, normalize_1.normalizeTxn)({
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
    }, ACCOUNTS);
    strict_1.default.ok(t);
    strict_1.default.equal(t.amountMinor, 1000);
    strict_1.default.equal(t.inrMinor, 86661);
    strict_1.default.equal(t.fxConverted, true);
});
(0, node_test_1.default)('FX record without a rate falls back to the raw amount, unflagged', () => {
    const t = (0, normalize_1.normalizeTxn)({
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
    }, ACCOUNTS);
    strict_1.default.ok(t);
    strict_1.default.equal(t.inrMinor, 1000);
    strict_1.default.equal(t.fxConverted, false);
});
(0, node_test_1.default)('null category becomes Uncategorized; missing merchant becomes Unknown', () => {
    const t = (0, normalize_1.normalizeTxn)({
        id: 'txn_3',
        account_id: 'acc_3310',
        occurred_at: '2026-09-12T04:30:00Z',
        direction: 'debit',
        amount_minor: 247816,
        currency: 'INR',
        category: null,
        status: 'POSTED',
        updated_at: '2026-09-12T05:01:00Z',
    }, ACCOUNTS);
    strict_1.default.ok(t);
    strict_1.default.equal(t.category, 'Uncategorized');
    strict_1.default.equal(t.merchant, 'Unknown');
});
(0, node_test_1.default)('unusable records are dropped, not guessed', () => {
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
    strict_1.default.equal((0, normalize_1.normalizeTxn)({ ...base }, ACCOUNTS), null); // no id
    strict_1.default.equal((0, normalize_1.normalizeTxn)({ ...base, id: 'a', direction: 'weird' }, ACCOUNTS), null);
    strict_1.default.equal((0, normalize_1.normalizeTxn)({ ...base, id: 'a', occurred_at: undefined }, ACCOUNTS), null);
    strict_1.default.equal((0, normalize_1.normalizeTxn)({ ...base, id: 'a', amount_minor: undefined, amount: 'nope' }, ACCOUNTS), null);
    strict_1.default.equal((0, normalize_1.normalizeTxn)({ ...base, id: 'a', amount_minor: -5 }, ACCOUNTS), null);
});
(0, node_test_1.default)('mergeTxns: boundary duplicate unchanged, newer wins, older ignored', () => {
    const map = new Map();
    const a = (0, normalize_1.normalizeTxn)({
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
    }, ACCOUNTS);
    strict_1.default.deepEqual((0, normalize_1.mergeTxns)(map, [a]), { added: 1, updated: 0, unchanged: 0 });
    strict_1.default.deepEqual((0, normalize_1.mergeTxns)(map, [a]), { added: 0, updated: 0, unchanged: 1 });
    const newer = { ...a, amountMinor: 200, inrMinor: 200, updatedAt: '2026-10-10T00:00:00Z' };
    strict_1.default.deepEqual((0, normalize_1.mergeTxns)(map, [newer]), { added: 0, updated: 1, unchanged: 0 });
    strict_1.default.equal(map.get('x').amountMinor, 200);
    strict_1.default.deepEqual((0, normalize_1.mergeTxns)(map, [a]), { added: 0, updated: 0, unchanged: 1 });
    strict_1.default.equal(map.get('x').amountMinor, 200);
});
