export interface LowResult { isNewLow: boolean; lowCents: number; }
export const evaluateLow = (currentCents: number, prevLowCents: number | null): LowResult =>
  prevLowCents === null || currentCents < prevLowCents
    ? { isNewLow: true, lowCents: currentCents }
    : { isNewLow: false, lowCents: prevLowCents };
export const isAtLow = (currentCents: number, lowCents: number | null): boolean =>
  lowCents !== null && currentCents <= lowCents;
