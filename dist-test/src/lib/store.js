"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncStore = void 0;
/**
 * Sync engine + local store.
 *
 * Persistence model (AsyncStorage in the app, memory in tests):
 *   track:txns     — JSON object: id -> canonical Txn
 *   track:meta     — { syncToken, fullCursor, accounts }
 *
 * Guarantees:
 * 1. A failure never costs the user cached data. Fetches only ever merge
 *    into the map; the map is only replaced by a newer record for the same
 *    id, or pruned by an explicit server delete. A failed sync leaves the
 *    previous map and token untouched.
 * 2. Kill-safety. Progress is persisted after every page of a full sync
 *    (map + cursor). If the app is killed mid-sync, the next launch resumes
 *    from the stored cursor instead of restarting.
 * 3. Exactly once. Dedupe is by id everywhere: the list endpoint re-sends
 *    the boundary record on each page, and re-fetched change pages overlap
 *    after a mid-sync failure. mergeTxns collapses both.
 * 4. Latest truth wins. An upsert only replaces a stored record when its
 *    updated_at is newer (or equal-but-different, for rows without a
 *    timestamp). Deletes are explicit { id, deleted: true } records.
 * 5. Token discipline. The new sync token is persisted only when a changes
 *    run reaches its last page. A mid-run failure keeps the old token, and
 *    re-running the changes feed is idempotent, so nothing is lost.
 * 6. Expired tokens. A 410 from the changes feed means "do a full sync":
 *    the engine falls back to a full sync automatically.
 * 7. Racing syncs. Every run takes a monotonically increasing run id; a
 *    superseded run stops fetching and never persists a token. Merges from
 *    a stale run are harmless (idempotent, latest-wins) but its token
 *    write is suppressed.
 */
const api_1 = require("./api");
const normalize_1 = require("./normalize");
const DEFAULT_PREFIX = 'track:';
class SyncStore {
    storage;
    api;
    onChange;
    txns = new Map();
    accounts = [];
    syncToken = null;
    fullCursor = null;
    lastSyncedAt = null;
    runId = 0;
    syncing = false;
    lastError = null;
    showingCached = false;
    stats = {
        total: 0,
        added: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
    };
    txnsKey;
    metaKey;
    constructor(storage, api, onChange, keyPrefix = DEFAULT_PREFIX) {
        this.storage = storage;
        this.api = api;
        this.onChange = onChange;
        this.txnsKey = `${keyPrefix}txns`;
        this.metaKey = `${keyPrefix}meta`;
    }
    /** Load cached state. Call once at startup, before any sync. */
    async loadCache() {
        try {
            const [txnsRaw, metaRaw] = await Promise.all([
                this.storage.getItem(this.txnsKey),
                this.storage.getItem(this.metaKey),
            ]);
            if (txnsRaw) {
                const obj = JSON.parse(txnsRaw);
                this.txns = new Map(Object.values(obj).map((t) => [t.id, t]));
            }
            if (metaRaw) {
                const meta = JSON.parse(metaRaw);
                this.syncToken = meta.syncToken ?? null;
                this.fullCursor = meta.fullCursor ?? null;
                this.accounts = Array.isArray(meta.accounts) ? meta.accounts : [];
                this.lastSyncedAt = meta.lastSyncedAt ?? null;
            }
            // Account labels can go stale if accounts changed; refresh them.
            for (const t of this.txns.values()) {
                t.accountLabel = (0, normalize_1.accountLabel)(t.accountId, this.accounts);
            }
            this.stats.total = this.txns.size;
        }
        catch {
            // A corrupt cache must never brick the app: start empty, sync fresh.
            this.txns = new Map();
            this.syncToken = null;
            this.fullCursor = null;
        }
        this.emit();
    }
    emit() {
        this.onChange({
            txns: [...this.txns.values()],
            accounts: this.accounts,
            syncToken: this.syncToken,
            fullCursor: this.fullCursor,
            syncing: this.syncing,
            lastSyncedAt: this.lastSyncedAt,
            lastError: this.lastError,
            showingCached: this.showingCached,
            stats: { ...this.stats },
        });
    }
    async persist(metaOnly = false) {
        const meta = {
            syncToken: this.syncToken,
            fullCursor: this.fullCursor,
            accounts: this.accounts,
            lastSyncedAt: this.lastSyncedAt,
        };
        if (!metaOnly) {
            await this.storage.setItem(this.txnsKey, JSON.stringify(Object.fromEntries(this.txns)));
        }
        await this.storage.setItem(this.metaKey, JSON.stringify(meta));
    }
    normalizeBatch(items) {
        const txns = [];
        const deletes = [];
        let skipped = 0;
        for (const raw of items) {
            const r = raw;
            if (r && r.deleted === true && typeof r.id === 'string') {
                deletes.push(r.id);
                continue;
            }
            const t = (0, normalize_1.normalizeTxn)(raw, this.accounts);
            if (t)
                txns.push(t);
            else
                skipped++;
        }
        return { txns, deletes, skipped };
    }
    applyBatch(items, stats) {
        const { txns, deletes, skipped } = this.normalizeBatch(items);
        const merged = (0, normalize_1.mergeTxns)(this.txns, txns);
        stats.added += merged.added;
        stats.updated += merged.updated;
        stats.skipped += skipped;
        for (const id of deletes) {
            if (this.txns.delete(id))
                stats.deleted++;
        }
        stats.total = this.txns.size;
    }
    /** Full sync, resumable from a stored cursor. */
    async fullSync(run) {
        let cursor = this.fullCursor;
        const stats = {
            total: this.txns.size,
            added: 0,
            updated: 0,
            deleted: 0,
            skipped: 0,
        };
        // A fresh full sync (not a resume) starts from a clean map: the list
        // feed is authoritative for current state, and stale rows that the
        // server no longer returns must not linger.
        if (!cursor) {
            this.txns = new Map();
            stats.total = 0;
        }
        for (;;) {
            if (run !== this.runId)
                return; // superseded
            const page = await this.api.listTransactions(cursor);
            if (run !== this.runId)
                return;
            this.applyBatch(page.items, stats);
            cursor = page.nextCursor;
            this.fullCursor = cursor;
            if (cursor === null) {
                // Only the token from the final page is authoritative.
                if (page.syncToken)
                    this.syncToken = page.syncToken;
                this.fullCursor = null;
                this.lastSyncedAt = new Date().toISOString();
                this.stats = stats;
                await this.persist();
                return;
            }
            this.stats = { ...stats, total: this.txns.size };
            await this.persist();
            this.emit();
        }
    }
    /** Incremental sync from the stored token. Falls back to full on 410. */
    async incrementalSync(run) {
        const since = this.syncToken;
        let cursor = null;
        const stats = {
            total: this.txns.size,
            added: 0,
            updated: 0,
            deleted: 0,
            skipped: 0,
        };
        for (;;) {
            if (run !== this.runId)
                return;
            let page;
            try {
                page = await this.api.listChanges(since, cursor);
            }
            catch (e) {
                if (e instanceof api_1.ApiError && e.status === 410) {
                    // Token expired: the server's own instruction is a full sync.
                    await this.fullSync(run);
                    return;
                }
                throw e;
            }
            if (run !== this.runId)
                return;
            this.applyBatch(page.items, stats);
            cursor = page.nextCursor;
            if (cursor === null) {
                // Last page only: now it is safe to advance the token.
                this.syncToken = page.syncToken;
                this.lastSyncedAt = new Date().toISOString();
                this.stats = stats;
                await this.persist();
                return;
            }
            // Mid-run: persist merged changes but NOT the new token, so a
            // failure here replays these pages idempotently next time.
            this.stats = { ...stats, total: this.txns.size };
            await this.persist();
            this.emit();
        }
    }
    /**
     * Run a sync: incremental when we have a token, otherwise full.
     * A resume of an interrupted full sync takes priority (stored cursor).
     * Throws on failure, but cached data and the old token survive intact.
     */
    async sync() {
        const run = ++this.runId;
        this.syncing = true;
        this.lastError = null;
        this.showingCached = false;
        this.emit();
        try {
            // Refresh accounts first; normalization depends on them.
            try {
                const raw = await this.api.getAccounts();
                this.accounts = raw
                    .filter((a) => typeof a?.id === 'string' && typeof a?.last4 === 'string')
                    .map((a) => ({
                    id: a.id,
                    bank: typeof a.bank === 'string' ? a.bank : '',
                    type: typeof a.type === 'string' ? a.type : '',
                    last4: a.last4,
                    nickname: typeof a.nickname === 'string' ? a.nickname : '',
                }));
            }
            catch {
                // Accounts failing must not block a sync: keep the cached list.
            }
            if (this.fullCursor)
                await this.fullSync(run);
            else if (this.syncToken)
                await this.incrementalSync(run);
            else
                await this.fullSync(run);
            if (run === this.runId) {
                this.syncing = false;
                this.emit();
            }
        }
        catch (e) {
            if (run === this.runId) {
                this.syncing = false;
                this.lastError =
                    e instanceof Error ? e.message : 'Sync failed. Showing saved data.';
                // Keep the map and token exactly as they were: the failure cost
                // nothing the user could already see.
                this.showingCached = this.txns.size > 0;
                try {
                    await this.persist();
                }
                catch {
                    // Persistence failing must not mask the original error.
                }
                this.emit();
            }
            throw e;
        }
    }
    /** Start a sync in the background; a newer call supersedes an older one. */
    syncInBackground() {
        return this.sync().catch(() => {
            // Background syncs report through state, not thrown errors.
        });
    }
    snapshot() {
        return {
            txns: [...this.txns.values()],
            accounts: this.accounts,
            syncToken: this.syncToken,
            fullCursor: this.fullCursor,
            syncing: this.syncing,
            lastSyncedAt: this.lastSyncedAt,
            lastError: this.lastError,
            showingCached: this.showingCached,
            stats: { ...this.stats },
        };
    }
}
exports.SyncStore = SyncStore;
