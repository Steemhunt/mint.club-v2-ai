import { describe, expect, it, vi } from 'vitest';
import { maxUint256, type Address } from 'viem';
import {
  ensureApproval,
  ensureERC1155Approval,
} from '../src/utils/approve';

const OWNER = '0x1111111111111111111111111111111111111111' as Address;
const TOKEN = '0x2222222222222222222222222222222222222222' as Address;
const SPENDER = '0x3333333333333333333333333333333333333333' as Address;
const HASH = `0x${'4'.repeat(64)}` as `0x${string}`;
const RESET_HASH = `0x${'5'.repeat(64)}` as `0x${string}`;

describe('ERC-20 approval', () => {
  it('does not broadcast when approval simulation returns false', async () => {
    const pub = {
      readContract: vi.fn().mockResolvedValue(0n),
      call: vi.fn().mockResolvedValue({
        data: `0x${'00'.repeat(32)}`,
      }),
      waitForTransactionReceipt: vi.fn(),
    };
    const wallet = {
      account: { address: OWNER },
      writeContract: vi.fn().mockResolvedValue(HASH),
    };

    await expect(
      ensureApproval(pub as any, wallet as any, TOKEN, SPENDER, 1n),
    ).rejects.toThrow('ERC-20 approval returned false');

    expect(wallet.writeContract).not.toHaveBeenCalled();
    expect(pub.waitForTransactionReceipt).not.toHaveBeenCalled();
  });

  it('rejects a reverted approval receipt', async () => {
    const pub = {
      readContract: vi.fn().mockResolvedValue(0n),
      call: vi.fn().mockResolvedValue({ data: '0x' }),
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
      call: vi.fn().mockResolvedValue({ data: '0x' }),
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

  it('resets a nonzero insufficient allowance before approving the maximum', async () => {
    const pub = {
      readContract: vi.fn().mockResolvedValue(1n),
      call: vi.fn().mockResolvedValue({ data: '0x' }),
      waitForTransactionReceipt: vi
        .fn()
        .mockResolvedValue({ status: 'success' }),
    };
    const wallet = {
      account: { address: OWNER },
      writeContract: vi
        .fn()
        .mockResolvedValueOnce(RESET_HASH)
        .mockResolvedValueOnce(HASH),
    };

    await ensureApproval(pub as any, wallet as any, TOKEN, SPENDER, 2n);

    expect(wallet.writeContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ args: [SPENDER, 0n] }),
    );
    expect(wallet.writeContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ args: [SPENDER, maxUint256] }),
    );
    expect(pub.waitForTransactionReceipt).toHaveBeenNthCalledWith(1, {
      hash: RESET_HASH,
    });
    expect(pub.waitForTransactionReceipt).toHaveBeenNthCalledWith(2, {
      hash: HASH,
    });
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

describe('ERC-1155 approval', () => {
  it('sets and confirms operator approval when needed', async () => {
    const pub = {
      readContract: vi.fn().mockResolvedValue(false),
      waitForTransactionReceipt: vi
        .fn()
        .mockResolvedValue({ status: 'success' }),
    };
    const wallet = {
      account: { address: OWNER },
      writeContract: vi.fn().mockResolvedValue(HASH),
    };

    await ensureERC1155Approval(
      pub as any,
      wallet as any,
      TOKEN,
      SPENDER,
    );

    expect(pub.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'isApprovedForAll',
        args: [OWNER, SPENDER],
      }),
    );
    expect(wallet.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'setApprovalForAll',
        args: [SPENDER, true],
      }),
    );
    expect(pub.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: HASH });
  });

  it('skips the transaction when operator approval already exists', async () => {
    const pub = {
      readContract: vi.fn().mockResolvedValue(true),
      waitForTransactionReceipt: vi.fn(),
    };
    const wallet = {
      account: { address: OWNER },
      writeContract: vi.fn(),
    };

    await ensureERC1155Approval(
      pub as any,
      wallet as any,
      TOKEN,
      SPENDER,
    );

    expect(wallet.writeContract).not.toHaveBeenCalled();
    expect(pub.waitForTransactionReceipt).not.toHaveBeenCalled();
  });
});
