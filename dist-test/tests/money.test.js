"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const money_1 = require("../src/lib/money");
(0, node_test_1.default)('decimalStringToMinor: exact string math, no float errors', () => {
    strict_1.default.equal((0, money_1.decimalStringToMinor)('516.49'), 51649);
    strict_1.default.equal((0, money_1.decimalStringToMinor)('30.00'), 3000);
    strict_1.default.equal((0, money_1.decimalStringToMinor)('242333'), 24233300);
    strict_1.default.equal((0, money_1.decimalStringToMinor)('0.10'), 10);
    strict_1.default.equal((0, money_1.decimalStringToMinor)('1234567.89'), 123456789);
    strict_1.default.equal((0, money_1.decimalStringToMinor)('614.28'), 61428);
    strict_1.default.equal((0, money_1.decimalStringToMinor)('abc'), null);
    strict_1.default.equal((0, money_1.decimalStringToMinor)(''), null);
    strict_1.default.equal((0, money_1.decimalStringToMinor)(516.49), null);
    strict_1.default.equal((0, money_1.decimalStringToMinor)('-5.00'), -500);
});
(0, node_test_1.default)('formatINR: Indian digit grouping', () => {
    strict_1.default.equal((0, money_1.formatINR)(12345678), '₹1,23,456.78');
    strict_1.default.equal((0, money_1.formatINR)(28525689), '₹2,85,256.89');
    strict_1.default.equal((0, money_1.formatINR)(50), '₹0.50');
    strict_1.default.equal((0, money_1.formatINR)(0), '₹0.00');
    strict_1.default.equal((0, money_1.formatINR)(-12345), '-₹123.45');
    strict_1.default.equal((0, money_1.formatINR)(123456789), '₹12,34,567.89');
});
(0, node_test_1.default)('monthKeyIST: late-evening UTC falls in the next IST month', () => {
    // The two 2025-09-30 UTC-evening fixture rows land in 2025-10 IST.
    strict_1.default.equal((0, money_1.monthKeyIST)('2025-09-30T19:15:00Z'), '2025-10');
    strict_1.default.equal((0, money_1.monthKeyIST)('2025-09-30T18:00:00Z'), '2025-09');
    strict_1.default.equal((0, money_1.monthKeyIST)('2026-10-10T17:03:00Z'), '2026-10');
    strict_1.default.equal((0, money_1.monthKeyIST)('not-a-date'), 'unknown');
});
(0, node_test_1.default)('monthLabel', () => {
    strict_1.default.equal((0, money_1.monthLabel)('2026-10'), 'October 2026');
    strict_1.default.equal((0, money_1.monthLabel)('2025-09'), 'September 2025');
});
