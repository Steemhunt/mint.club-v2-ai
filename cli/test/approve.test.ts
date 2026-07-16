import { describe, expect, it, vi } from 'vitest';
import { maxUint256, type Address } from 'viem';
import { ensureApproval } from '../src/utils/approve';

const OWNER = '0x1111111111111111111111111111111111111111' as Address;
const TOKEN = '0x2222222222222222222222222222222222222222' as Address;
const SPENDER = '0x3333333333333333333333333333333333333333' as Address;
const HASH = `0x${'4'.repeat(64)}` as `0x${string}`;

describe('ERC-20 approval', () => {
  it('rejects a reverted approval receipt', async () => {
    const pub = {
      readContract: vi.fn().mockResolvedValue(0n),
      waitForTransactionReceipt: vi
        .fn()
        .mockResolvedValue({ status: 'reverted' }),
    };
    const wallet = {
      account: { address: OWNER },
      writeContract: vi.fn().mockResolvedValue(HASH),
    };

    await expect(
      ensureApproval(pub as any, wallet as any, TOKEN, SPENDER, 1n),
    ).rejects.toThrow('Approval transaction failed');
  });

  it('writes and confirms a maximum approval when allowance is insufficient', async () => {
    const pub = {
      readContract: vi.fn().mockResolvedValue(0n),
      waitForTransactionReceipt: vi
        .fn()
        .mockResolvedValue({ status: 'success' }),
    };
    const wallet = {
      account: { address: OWNER },
      writeContract: vi.fn().mockResolvedValue(HASH),
    };

    await ensureApproval(pub as any, wallet as any, TOKEN, SPENDER, 1n);

    expect(wallet.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ args: [SPENDER, maxUint256] }),
    );
    expect(pub.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: HASH });
  });

  it('skips approval when the current allowance is sufficient', async () => {
    const pub = {
      readContract: vi.fn().mockResolvedValue(2n),
      waitForTransactionReceipt: vi.fn(),
    };
    const wallet = {
      account: { address: OWNER },
      writeContract: vi.fn(),
    };

    await ensureApproval(pub as any, wallet as any, TOKEN, SPENDER, 1n);

    expect(wallet.writeContract).not.toHaveBeenCalled();
    expect(pub.waitForTransactionReceipt).not.toHaveBeenCalled();
  });
});
