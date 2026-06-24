export const twd = (cents: number): string =>
  `NT$ ${Math.round(cents / 100).toLocaleString('en-US')}`;
export const minutesAgo = (genSec: number, nowMs = Date.now()): number =>
  Math.max(0, Math.round((nowMs / 1000 - genSec) / 60));
