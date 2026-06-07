/** Pure popup formatting helpers. */
import type { LimitInfo } from '../../shared/types';

/** Formats a usage-limit row for compact popup display. */
export function formatLimitItem(item: LimitInfo['items'][number]): string {
  const featureLabel = String(item.featureLabel || '').trim();
  const windowLabel = String(item.windowLabel || '').trim();
  const label = [featureLabel, windowLabel].filter(Boolean).join(' ').trim() || windowLabel || 'Limit';
  return `${label}: ${formatLimitPercent(item.leftPercent)}% left, resets ${formatResetTime(item.resetsAt)}`;
}

/** Formats usage percentages without trailing decimals when possible. */
export function formatLimitPercent(value: number): string {
  const rounded = Number(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Formats a Unix reset timestamp in local short date/time form. */
export function formatResetTime(unixSeconds: number): string {
  try {
    const date = new Date(Number(unixSeconds) * 1000);
    const now = new Date();
    const sameDay = date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    if (sameDay) {
      return `${hours}:${minutes}`;
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}.${month} ${hours}:${minutes}`;
  } catch {
    return '--:--';
  }
}

/** Removes control characters and excessive whitespace from extracted CV text. */
export function sanitizeCvText(value: string): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Sums Deepgram balances by unit and formats them for the limits panel. */
export function formatDeepgramBalances(balances: Array<{ amount?: number; units?: string }>): string {
  if (balances.length === 0) {
    return 'no balance data';
  }

  const totals = new Map<string, number>();
  for (const balance of balances) {
    const amount = typeof balance.amount === 'number' && Number.isFinite(balance.amount) ? balance.amount : 0;
    const units = String(balance.units || '').trim().toUpperCase() || 'UNITS';
    totals.set(units, (totals.get(units) || 0) + amount);
  }

  return Array.from(totals.entries())
    .map(([units, amount]) => units === 'USD' ? `$${amount.toFixed(2)}` : `${formatDeepgramAmount(amount)} ${units}`)
    .join(', ');
}

/** Formats one Deepgram balance amount. */
function formatDeepgramAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
