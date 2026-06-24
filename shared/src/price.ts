export const centsToTwd = (cents: number): number => Math.round(cents) / 100;
export const formatTwd = (cents: number): string =>
  `NT$ ${Math.round(centsToTwd(cents)).toLocaleString('en-US')}`;
export const discountPercent = (regularCents: number, finalCents: number): number =>
  regularCents <= 0 ? 0 : Math.round((1 - finalCents / regularCents) * 100);
