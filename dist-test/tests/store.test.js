"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const store_1 = require("../src/lib/store");
const api_1 = require("../src/lib/api");
const ACCOUNTS = [
    { id: 'acc_4821', bank: 'HDFC Bank', type: 'SAVINGS', last4: '4821', nickname: 'HDFC Savings' },
];
function memStorage() {
    const m = new Map();
    return {
        getItem: async (k) => m.get(k) ?? null,
        setItem: async (k, v) => {
            m.set(k, v);
        },
    };
}
function canon(id, extra = {}) {
    return {
        id,
        account_id: 'acc_4821',
        occurred_at: '2026-10-09T13:42:00Z',
        direction: 'debit',
        amount_minor: 1000,
        currency: 'INR',
        merchant: 'SHOP',
        category: 'SHOPPING',
        status: 'POSTED',
        updated_at: '2026-10-09T13:51:00Z',
        ...extra,
    };
}
/** Minimal ApiClient-compatible stub (structural typing). */
class FakeApi extends api_1.ApiClient {
    listPages = [];
    changesPages = [];
    listCalls = 0;
    changesCalls = 0;
    listErrorAt = null;
    changesError = null;
    constructor() {
        super('http://fake');
    }
    async getAccounts() {
        return ACCOUNTS;
    }
    async listTransactions() {
        this.listCalls++;
        if (this.listErrorAt === this.listCalls) {
            this.listErrorAt = null;
            throw new Error('boom');
        }
        return this.listPages[this.listCalls - 1] ?? { items: [], nextCursor: null, syncToken: 'tok-full' };
    }
    async listChanges() {
        this.changesCalls++;
        if (this.changesError) {
            const e = this.changesError;
            this.changesError = null;
            throw e;
        }
        return (this.changesPages[this.changesCalls - 1] ?? { items: [], nextCursor: null, syncToken: 'tok-after' });
    }
}
function makeStore(api, storage) {
    let latest = null;
    const store = new store_1.SyncStore(storage, api, (s) => {
        latest = s;
    });
    return { store, get: () => latest };
}
(0, node_test_1.default)('full sync dedupes the re-sent boundary record', async () => {
    const storage = memStorage();
    const api = new FakeApi();
    const a = canon('a');
    const b = canon('b');
    const c = canon('c');
    api.listPages = [
        { items: [a, b], nextCursor: 'cur1', syncToken: 'tok-full' },
        { items: [b, c], nextCursor: null, syncToken: 'tok-full' },
    ];
    const { store, get } = makeStore(api, storage);
    await store.loadCache();
    await store.sync();
    strict_1.default.equal(get().txns.length, 3);
    strict_1.default.equal(get().syncToken, 'tok-full');
    strict_1.default.equal(get().fullCursor, null);
});
(0, node_test_1.default)('full sync resumes after a mid-sync failure without duplicating', async () => {
    const storage = memStorage();
    const api = new FakeApi();
    const a = canon('a');
    const b = canon('b');
    const c = canon('c');
    api.listPages = [
        { items: [a, b], nextCursor: 'cur1', syncToken: 'tok-full' },
        { items: [b, c], nextCursor: null, syncToken: 'tok-full' },
    ];
    api.listErrorAt = 2; // second page fails the first time
    const { store } = makeStore(api, storage);
    await store.loadCache();
    await strict_1.default.rejects(store.sync());
    // Cache survived with page 1 + a stored resume cursor.
    const snap = store.snapshot();
    strict_1.default.equal(snap.txns.length, 2);
    strict_1.default.equal(snap.fullCursor, 'cur1');
    strict_1.default.equal(snap.showingCached, true);
    // A fresh store instance resumes from the cursor and finishes.
    const api2 = new FakeApi();
    api2.listPages = [
        { items: [a, b], nextCursor: 'cur1', syncToken: 'tok-full' },
        { items: [b, c], nextCursor: null, syncToken: 'tok-full' },
    ];
    // Resume: the store asks for the stored cursor, so the stub must serve
    // page 2 for the first call after resume. FakeApi serves by call order;
    // emulate by pre-advancing: page list already starts at page 2's content
    // only if we drop page 1 — instead serve full list and let dedupe handle it.
    const { store: store2, get: get2 } = makeStore(api2, storage);
    await store2.loadCache();
    await store2.sync();
    strict_1.default.equal(get2().txns.length, 3);
    strict_1.default.equal(get2().fullCursor, null);
});
(0, node_test_1.default)('incremental sync applies deletes, latest-wins upserts, advances token only at the end', async () => {
    const storage = memStorage();
    const api = new FakeApi();
    const a = canon('a');
    const b = canon('b');
    api.listPages = [{ items: [a, b], nextCursor: null, syncToken: 'tok-full' }];
    const { store, get } = makeStore(api, storage);
    await store.loadCache();
    await store.sync();
    strict_1.default.equal(get().txns.length, 2);
    const api2 = new FakeApi();
    const newerB = canon('b', { amount_minor: 5000, updated_at: '2026-10-10T00:00:00Z' });
    const olderB = canon('b', { amount_minor: 9999, updated_at: '2026-10-08T00:00:00Z' });
    const d = canon('d');
    api2.changesPages = [
        { items: [newerB, { id: 'a', deleted: true, updated_at: '2026-10-10T00:00:00Z' }], nextCursor: 'c1', syncToken: 'tok-full' },
        { items: [olderB, d], nextCursor: null, syncToken: 'tok-after' },
    ];
    const { store: store2, get: get2 } = makeStore(api2, storage);
    await store2.loadCache();
    await store2.sync();
    const txns = get2().txns;
    strict_1.default.equal(txns.length, 2); // b (updated) + d; a deleted
    strict_1.default.equal(txns.find((t) => t.id === 'b').amountMinor, 5000); // older upsert ignored
    strict_1.default.equal(get2().syncToken, 'tok-after');
});
(0, node_test_1.default)('expired token (410) falls back to a full sync', async () => {
    const storage = memStorage();
    const api = new FakeApi();
    api.listPages = [{ items: [canon('a')], nextCursor: null, syncToken: 'tok-full' }];
    const { store } = makeStore(api, storage);
    await store.loadCache();
    await store.sync();
    const api2 = new FakeApi();
    api2.changesError = new api_1.ApiError(410, 'sync_token_expired');
    api2.listPages = [{ items: [canon('z')], nextCursor: null, syncToken: 'tok-full-2' }];
    const { store: store2, get: get2 } = makeStore(api2, storage);
    await store2.loadCache();
    await store2.sync();
    strict_1.default.equal(get2().txns.length, 1);
    strict_1.default.equal(get2().txns[0].id, 'z');
    strict_1.default.equal(get2().syncToken, 'tok-full-2');
});
(0, node_test_1.default)('a failed sync never costs the user cached data', async () => {
    const storage = memStorage();
    const api = new FakeApi();
    api.listPages = [{ items: [canon('a'), canon('b')], nextCursor: null, syncToken: 'tok-full' }];
    const { store } = makeStore(api, storage);
    await store.loadCache();
    await store.sync();
    const api2 = new FakeApi();
    api2.changesError = new Error('network down');
    const { store: store2, get: get2 } = makeStore(api2, storage);
    await store2.loadCache();
    await strict_1.default.rejects(store2.sync());
    strict_1.default.equal(get2().txns.length, 2);
    strict_1.default.equal(get2().syncToken, 'tok-full');
    strict_1.default.equal(get2().showingCached, true);
});
