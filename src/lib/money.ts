/**
 * Money math. One rule governs this file: never do arithmetic on
 * floating-point rupees. Amounts are integers in minor units (paise/cents)
 * from the moment they enter the app until the moment they are formatted
 * for display. The only division by 100 happens inside formatINR.
 */

/**
 * Convert a decimal amount string ("516.49", "30.00", "242333") to integer
 * minor units, using string arithmetic only. Avoids float errors like
 * 0.1 + 0.2 or 516.49 * 100 === 51648.999... .
 * Returns null when the string is not a valid non-negative decimal.
 */
export function decimalStringToMinor(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(value.trim());
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const frac = (m[3] ?? '').padEnd(2, '0').slice(0, 2);
  // A third decimal place means sub-paisa precision we cannot represent
  // exactly; round half away from zero on that digit.
  let minor = parseInt(m[2], 10) * 100 + parseInt(frac, 10);
  if (m[3] && m[3].length === 3 && parseInt(m[3][2], 10) >= 5) minor += 1;
  return sign * minor;
}

/** Format integer minor units as Indian rupees, e.g. 12345678 -> ₹1,23,456.78 */
export function formatINR(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  const grouped = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(rupees);
  return `${negative ? '-' : ''}₹${grouped}.${String(paise).padStart(2, '0')}`;
}

/** Format a foreign-currency minor amount, e.g. USD 1000 -> $10.00 */
export function formatForeign(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

/**
 * Calendar month key for a timestamp in the user's timezone.
 * The user is in India, and the backend checkpoint groups months by
 * Asia/Kolkata calendar months (verified: the two 2025-09-30 UTC-evening
 * records land in 2025-10 IST and the checkpoint has no 2025-09 month).
 * Using UTC here would misplace every late-evening transaction.
 */
export function monthKeyIST(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(d);
    const y = parts.find((p) => p.type === 'year')!.value;
    const m = parts.find((p) => p.type === 'month')!.value;
    return `${y}-${m}`;
  } catch {
    // Devices with minimal ICU data: fall back to a fixed +5:30 shift,
    // which is exact for Asia/Kolkata (no daylight saving).
    const shifted = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
    return shifted.toISOString().slice(0, 7);
  }
}

/** "2026-10" -> "October 2026" for month headers. */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  const d = new Date(Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, 1));
  return d.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Short date for a row, e.g. "09 Oct 2026", shown in IST. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    const shifted = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
    return shifted.toISOString().slice(0, 10).split('-').reverse().join(' ');
  }
}
