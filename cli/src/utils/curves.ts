import { formatUnits, parseUnits } from 'viem';

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
  reserveDecimals = 18,
): { ranges: bigint[]; prices: bigint[] } {
  const supply = parseUnits(maxSupply, 18);
  const initialPriceRaw = parseUnits(initialPrice, reserveDecimals);
  const finalPriceRaw = parseUnits(finalPrice, reserveDecimals);

  if (supply <= 0n) throw new Error('Max supply must be positive');
  if (initialPriceRaw <= 0n || finalPriceRaw <= 0n) {
    throw new Error('Prices must be positive');
  }
  if (curve === 'flat') {
    if (initialPriceRaw !== finalPriceRaw) {
      throw new Error('Flat curve requires initial and final price to be the same');
    }
    return { ranges: [supply], prices: [initialPriceRaw] };
  }
  if (finalPriceRaw <= initialPriceRaw) {
    throw new Error('Final price must be greater than initial price');
  }

  // MCV2_Bond requires both ranges and prices to be strictly increasing.
  // A reserve with d decimals can encode at most one step per raw price unit.
  const priceSlots = finalPriceRaw - initialPriceRaw + 1n;
  const stepCountRaw = [BigInt(STEP_COUNT), priceSlots, supply].reduce(
    (smallest, value) => (value < smallest ? value : smallest),
  );
  if (stepCountRaw < 2n) {
    throw new Error('Max supply is too small to encode a non-flat curve');
  }
  const stepCount = Number(stepCountRaw);
  const p0 = Number(initialPrice);
  const p1 = Number(finalPrice);
  if (!Number.isFinite(p0) || !Number.isFinite(p1)) {
    throw new Error('Price range is too large to generate a curve');
  }

  const ranges: bigint[] = [];
  const prices: bigint[] = [];
  const delta = finalPriceRaw - initialPriceRaw;
  const weightScaleNumber = 1_000_000_000_000_000;
  const weightScale = BigInt(weightScaleNumber);

  for (let i = 0; i < stepCount; i++) {
    const t = stepCount === 1 ? 1 : i / (stepCount - 1);
    const rangeTo = (supply * BigInt(i + 1)) / BigInt(stepCount);

    let priceRaw: bigint;
    if (i === 0 && stepCount > 1) {
      priceRaw = initialPriceRaw;
    } else if (i === stepCount - 1) {
      priceRaw = finalPriceRaw;
    } else {
      let weight: number;
      switch (curve) {
        case 'linear':
          weight = t;
          break;
        case 'exponential': {
          const ratio = p1 / p0;
          // At very large, very close prices, Number precision can collapse the
          // ratio to exactly 1. The exponential limit as ratio -> 1 is linear.
          weight = ratio === 1 ? t : (Math.pow(ratio, t) - 1) / (ratio - 1);
          break;
        }
        case 'logarithmic':
          weight = Math.log(1 + t * (Math.E - 1));
          break;
      }
      if (!Number.isFinite(weight)) {
        throw new Error('Price range is too large to generate a curve');
      }
      const scaledWeight = BigInt(
        Math.round(Math.max(0, Math.min(1, weight)) * weightScaleNumber),
      );
      priceRaw = initialPriceRaw + (delta * scaledWeight) / weightScale;
    }

    const lastPrice = prices.at(-1);
    if (lastPrice !== undefined && priceRaw <= lastPrice) {
      // A nonlinear curve can quantize adjacent samples to the same raw unit.
      // Keep one price step and extend its range; the last sample is always p1.
      if (i === stepCount - 1) ranges[ranges.length - 1] = supply;
      continue;
    }

    ranges.push(rangeTo);
    prices.push(priceRaw);
  }

  return { ranges, prices };
}

export function isCurveType(s: string): s is CurveType {
  return ['linear', 'exponential', 'logarithmic', 'flat'].includes(s);
}

/**
 * Calculate accumulated reserve cost to reach each milestone.
 * Uses trapezoidal integration over the step prices.
 */
export function calculateMilestones(
  ranges: bigint[],
  prices: bigint[],
  milestones = [10, 25, 50, 75, 100],
): { milestone: number; supply: bigint; cost: bigint }[] {
  const maxSupply = ranges[ranges.length - 1];
  const results: { milestone: number; supply: bigint; cost: bigint }[] = [];

  for (const pct of milestones) {
    const targetSupply = (maxSupply * BigInt(pct)) / 100n;
    let totalCost = 0n;
    let prevRange = 0n;

    for (let i = 0; i < ranges.length; i++) {
      const rangeStart = prevRange;
      const rangeEnd = ranges[i];
      const price = prices[i];

      if (targetSupply <= rangeStart) break;

      const effectiveEnd = targetSupply < rangeEnd ? targetSupply : rangeEnd;
      const width = effectiveEnd - rangeStart;
      // cost = width * price / 1e18 (both are in wei)
      totalCost += (width * price) / (10n ** 18n);

      prevRange = rangeEnd;
      if (targetSupply <= rangeEnd) break;
    }

    results.push({ milestone: pct, supply: targetSupply, cost: totalCost });
  }

  return results;
}

/** Format large numbers with K/M/B suffixes */
export function compactNum(n: bigint, decimals = 18): string {
  const val = Number(formatUnits(n, decimals));
  if (val >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(2)}K`;
  if (val >= 1) return val.toFixed(2);
  if (val >= 0.001) return val.toFixed(4);
  return val.toFixed(6);
}
