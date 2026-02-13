import { parseUnits } from 'viem';

export type CurveType = 'linear' | 'exponential' | 'logarithmic' | 'flat';

const STEP_COUNT = 500;

/**
 * Generate bonding curve steps for a given curve type.
 * Returns arrays of rangeTo and price values (in wei).
 */
export function generateCurve(
  curve: CurveType,
  maxSupply: string,
  initialPrice: string,
  finalPrice: string,
): { ranges: bigint[]; prices: bigint[] } {
  const supply = parseUnits(maxSupply, 18);
  const p0 = parseFloat(initialPrice);
  const p1 = parseFloat(finalPrice);

  if (p0 <= 0 || p1 <= 0) throw new Error('Prices must be positive');
  if (curve === 'flat' && p0 !== p1) {
    throw new Error('Flat curve requires initial and final price to be the same');
  }

  const ranges: bigint[] = [];
  const prices: bigint[] = [];

  const steps = curve === 'flat' ? 1 : STEP_COUNT;

  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 1 : (i + 1) / steps; // 0..1
    const rangeTo = (supply * BigInt(i + 1)) / BigInt(steps);

    let price: number;
    switch (curve) {
      case 'linear':
        price = p0 + (p1 - p0) * t;
        break;
      case 'exponential':
        // p0 * (p1/p0)^t — exponential interpolation
        price = p0 * Math.pow(p1 / p0, t);
        break;
      case 'logarithmic':
        // Inverse of exponential — steep early, flattens out
        // Using log interpolation: heavy growth at start
        price = p0 + (p1 - p0) * Math.log(1 + t * (Math.E - 1));
        break;
      case 'flat':
        price = p0;
        break;
    }

    ranges.push(rangeTo);
    prices.push(parseUnits(price.toFixed(18), 18));
  }

  return { ranges, prices };
}

export function isCurveType(s: string): s is CurveType {
  return ['linear', 'exponential', 'logarithmic', 'flat'].includes(s);
}
