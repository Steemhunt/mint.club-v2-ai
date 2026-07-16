import { describe, expect, it } from 'vitest';
import { parseUnits } from 'viem';
import { parseSteps } from '../src/utils/format';
import { compactNum, generateCurve } from '../src/utils/curves';

describe('reserve token decimals', () => {
  it('encodes and formats curve prices using reserve decimals', () => {
    const custom = parseSteps('100:0.01', 6);
    expect(custom.ranges).toEqual([parseUnits('100', 18)]);
    expect(custom.prices).toEqual([parseUnits('0.01', 6)]);

    const generated = generateCurve('flat', '100', '0.01', '0.01', 6);
    expect(generated.prices).toEqual([parseUnits('0.01', 6)]);
    expect(compactNum(parseUnits('1', 6), 6)).toBe('1.00');
  });

  it('keeps non-flat low-decimal curve steps strictly increasing', () => {
    for (const curve of ['linear', 'exponential', 'logarithmic'] as const) {
      const generated = generateCurve(
        curve,
        '100',
        '0.01',
        '0.0101',
        6,
      );

      expect(generated.ranges).toHaveLength(generated.prices.length);
      expect(generated.prices.length).toBeGreaterThanOrEqual(2);
      expect(generated.prices[0]).toBe(parseUnits('0.01', 6));
      expect(generated.ranges.at(-1)).toBe(parseUnits('100', 18));
      expect(generated.prices.at(-1)).toBe(parseUnits('0.0101', 6));
      expect(generated.prices.length).toBeLessThanOrEqual(101);

      for (let index = 1; index < generated.prices.length; index += 1) {
        expect(generated.ranges[index]).toBeGreaterThan(
          generated.ranges[index - 1],
        );
        expect(generated.prices[index]).toBeGreaterThan(
          generated.prices[index - 1],
        );
      }
    }
  });

  it('rejects decreasing non-flat curves', () => {
    expect(() =>
      generateCurve('linear', '100', '0.0101', '0.01', 6),
    ).toThrow('Final price must be greater than initial price');
  });

  it('rejects a non-flat curve when max supply has only one raw unit', () => {
    expect(() =>
      generateCurve(
        'linear',
        '0.000000000000000001',
        '1',
        '2',
        18,
      ),
    ).toThrow('Max supply is too small to encode a non-flat curve');
  });

  it('handles exponential prices whose numeric ratio rounds to one', () => {
    const generated = generateCurve(
      'exponential',
      '100',
      '100000000000000000',
      '100000000000000000.000000000000000002',
      18,
    );

    expect(generated.prices).toHaveLength(3);
    expect(generated.prices[1]).toBe(generated.prices[0] + 1n);
    expect(generated.prices[2]).toBe(generated.prices[1] + 1n);
  });
});
