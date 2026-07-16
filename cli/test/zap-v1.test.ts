import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import {
  addSlippage,
  buildZapBurnCall,
  buildZapMintCall,
  subtractSlippage,
} from '../src/utils/zap-v1';

const TOKEN = '0x1234567890123456789012345678901234567890' as Address;
const RECEIVER = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address;

describe('MCV2_ZapV1 calls', () => {
  it('builds Robinhood mintWithEth calls with native ETH value', () => {
    expect(
      buildZapMintCall({
        chain: 'robinhood',
        token: TOKEN,
        tokensToMint: 5n,
        maxEthAmount: 100n,
        receiver: RECEIVER,
      }),
    ).toMatchObject({
      address: '0xA3dCf3Ca587D9929d540868c924f208726DC9aB6',
      functionName: 'mintWithEth',
      args: [TOKEN, 5n, RECEIVER],
      value: 100n,
    });
  });

  it('builds Robinhood burnToEth calls with a minimum native refund', () => {
    expect(
      buildZapBurnCall({
        chain: 'robinhood',
        token: TOKEN,
        tokensToBurn: 5n,
        minEthRefund: 90n,
        receiver: RECEIVER,
      }),
    ).toMatchObject({
      address: '0xA3dCf3Ca587D9929d540868c924f208726DC9aB6',
      functionName: 'burnToEth',
      args: [TOKEN, 5n, 90n, RECEIVER],
    });
  });

  it('applies percentage slippage to native ETH limits', () => {
    expect(addSlippage(10_000n, 1)).toBe(10_100n);
    expect(subtractSlippage(10_000n, 1)).toBe(9_900n);
    expect(() => addSlippage(10_000n, -1)).toThrow('Slippage must be between 0 and 100');
    expect(() => subtractSlippage(10_000n, 101)).toThrow('Slippage must be between 0 and 100');
  });
});
