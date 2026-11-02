import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decimalStringToMinor,
  formatINR,
  monthKeyIST,
  monthLabel,
} from '../src/lib/money';

test('decimalStringToMinor: exact string math, no float errors', () => {
  assert.equal(decimalStringToMinor('516.49'), 51649);
  assert.equal(decimalStringToMinor('30.00'), 3000);
  assert.equal(decimalStringToMinor('242333'), 24233300);
  assert.equal(decimalStringToMinor('0.10'), 10);
  assert.equal(decimalStringToMinor('1234567.89'), 123456789);
  assert.equal(decimalStringToMinor('614.28'), 61428);
  assert.equal(decimalStringToMinor('abc'), null);
  assert.equal(decimalStringToMinor(''), null);
  assert.equal(decimalStringToMinor(516.49), null);
  assert.equal(decimalStringToMinor('-5.00'), -500);
});

test('formatINR: Indian digit grouping', () => {
  assert.equal(formatINR(12345678), '₹1,23,456.78');
  assert.equal(formatINR(28525689), '₹2,85,256.89');
  assert.equal(formatINR(50), '₹0.50');
  assert.equal(formatINR(0), '₹0.00');
  assert.equal(formatINR(-12345), '-₹123.45');
  assert.equal(formatINR(123456789), '₹12,34,567.89');
});

test('monthKeyIST: late-evening UTC falls in the next IST month', () => {
  // The two 2025-09-30 UTC-evening fixture rows land in 2025-10 IST.
  assert.equal(monthKeyIST('2025-09-30T19:15:00Z'), '2025-10');
  assert.equal(monthKeyIST('2025-09-30T18:00:00Z'), '2025-09');
  assert.equal(monthKeyIST('2026-10-10T17:03:00Z'), '2026-10');
  assert.equal(monthKeyIST('not-a-date'), 'unknown');
});

test('monthLabel', () => {
  assert.equal(monthLabel('2026-10'), 'October 2026');
  assert.equal(monthLabel('2025-09'), 'September 2025');
});
