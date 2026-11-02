"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupByMonth = groupByMonth;
exports.filterBySearch = filterBySearch;
exports.filterByAccount = filterByAccount;
const money_1 = require("./money");
function groupByMonth(txns) {
    const map = new Map();
    for (const t of txns) {
        const key = (0, money_1.monthKeyIST)(t.occurredAt);
        let g = map.get(key);
        if (!g) {
            g = { key, spendMinor: 0, incomeMinor: 0, count: 0, txns: [] };
            map.set(key, g);
        }
        g.txns.push(t);
        g.count++;
        if (!t.isOwnTransfer) {
            if (t.direction === 'debit')
                g.spendMinor += t.inrMinor;
            else
                g.incomeMinor += t.inrMinor;
        }
    }
    const groups = [...map.values()];
    for (const g of groups) {
        g.txns.sort((a, b) => {
            if (a.occurredAt !== b.occurredAt)
                return a.occurredAt < b.occurredAt ? 1 : -1;
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
function filterBySearch(txns, query) {
    const q = query.trim().toLowerCase();
    if (!q)
        return txns;
    return txns.filter((t) => t.merchant.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q));
}
function filterByAccount(txns, accountId) {
    if (!accountId)
        return txns;
    return txns.filter((t) => t.accountId === accountId);
}
