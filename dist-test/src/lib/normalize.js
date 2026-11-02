"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAccount = resolveAccount;
exports.accountLabel = accountLabel;
exports.normalizeTxn = normalizeTxn;
exports.mergeTxns = mergeTxns;
const money_1 = require("./money");
const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const asString = (v) => typeof v === 'string' && v.length > 0 ? v : null;
const asInt = (v) => typeof v === 'number' && Number.isInteger(v) ? v : null;
function resolveAccount(last4, accounts) {
    const found = accounts.find((a) => a.last4 === last4);
    if (found)
        return { id: found.id, label: found.nickname || `${found.bank} ••${found.last4}` };
    return { id: `legacy:${last4}`, label: `Account ••${last4}` };
}
function accountLabel(accountId, accounts) {
    const found = accounts.find((a) => a.id === accountId);
    if (found)
        return found.nickname || `${found.bank} ••${found.last4}`;
    if (accountId.startsWith('legacy:'))
        return `Account ••${accountId.slice('legacy:'.length)}`;
    return accountId;
}
/** Normalize one raw record. Returns null when the record is unusable. */
function normalizeTxn(raw, accounts) {
    if (!isRecord(raw))
        return null;
    const id = asString(raw.id);
    if (!id)
        return null;
    let accountId;
    let accountLabelText;
    if (asString(raw.account_id)) {
        accountId = raw.account_id;
        accountLabelText = accountLabel(accountId, accounts);
    }
    else if (asString(raw.account)) {
        const r = resolveAccount(raw.account, accounts);
        accountId = r.id;
        accountLabelText = r.label;
    }
    else {
        return null;
    }
    let occurredAt = null;
    if (asString(raw.occurred_at))
        occurredAt = raw.occurred_at;
    else if (typeof raw.txn_time === 'number' && Number.isFinite(raw.txn_time)) {
        occurredAt = new Date(raw.txn_time * 1000).toISOString();
    }
    if (!occurredAt || Number.isNaN(Date.parse(occurredAt)))
        return null;
    let direction = null;
    if (raw.direction === 'debit' || raw.direction === 'credit')
        direction = raw.direction;
    else if (raw.type === 'DR')
        direction = 'debit';
    else if (raw.type === 'CR')
        direction = 'credit';
    if (!direction)
        return null;
    let amountMinor = null;
    let currency = 'INR';
    if (asInt(raw.amount_minor) !== null) {
        amountMinor = raw.amount_minor;
        currency = asString(raw.currency) ?? 'INR';
    }
    else {
        amountMinor = (0, money_1.decimalStringToMinor)(raw.amount);
    }
    if (amountMinor === null || amountMinor < 0)
        return null;
    let inrMinor = amountMinor;
    let fxConverted = false;
    if (currency !== 'INR' && isRecord(raw.fx) && asInt(raw.fx.inr_minor) !== null) {
        inrMinor = raw.fx.inr_minor;
        fxConverted = true;
    }
    const counterparty = isRecord(raw.counterparty) ? raw.counterparty : null;
    const isOwnTransfer = (counterparty !== null && counterparty.type === 'OWN_ACCOUNT') ||
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
function mergeTxns(map, batch) {
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    for (const t of batch) {
        const old = map.get(t.id);
        if (!old) {
            map.set(t.id, t);
            added++;
        }
        else if ((t.updatedAt ?? '') > (old.updatedAt ?? '') ||
            (t.updatedAt === old.updatedAt && JSON.stringify(t) !== JSON.stringify(old))) {
            map.set(t.id, t);
            updated++;
        }
        else {
            unchanged++;
        }
    }
    return { added, updated, unchanged };
}
