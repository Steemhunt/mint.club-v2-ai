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
});
