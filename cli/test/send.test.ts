import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, type Address } from 'viem';

const mocks = vi.hoisted(() => ({
  publicClient: {
    readContract: vi.fn(),
    call: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
  },
  walletClient: {
    account: {
      address: '0x1111111111111111111111111111111111111111' as Address,
    },
    writeContract: vi.fn(),
    sendTransaction: vi.fn(),
  },
}));

vi.mock('../src/client', () => ({
  getPublicClient: () => mocks.publicClient,
  getWalletClient: () => mocks.walletClient,
}));

import { send } from '../src/commands/send';

const TOKEN = '0x2222222222222222222222222222222222222222' as Address;
const RECIPIENT = '0x3333333333333333333333333333333333333333' as Address;
const PRIVATE_KEY = `0x${'11'.repeat(32)}` as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.publicClient.readContract.mockImplementation(async ({ functionName }) =>
    functionName === 'decimals' ? 18 : 'FALSE',
  );
  mocks.publicClient.waitForTransactionReceipt.mockResolvedValue({
    status: 'success',
    blockNumber: 1n,
  });
  mocks.walletClient.writeContract.mockResolvedValue(`0x${'44'.repeat(32)}`);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('send ERC-20 return semantics', () => {
  it('does not broadcast when transfer simulation returns false', async () => {
    mocks.publicClient.call.mockResolvedValue({
      data: encodeAbiParameters([{ type: 'bool' }], [false]),
    });

    await expect(
      send(
        RECIPIENT,
        '1',
        PRIVATE_KEY,
        { token: TOKEN },
        'base',
      ),
    ).rejects.toThrow('ERC-20 transfer returned false');

    expect(mocks.walletClient.writeContract).not.toHaveBeenCalled();
    expect(mocks.publicClient.waitForTransactionReceipt).not.toHaveBeenCalled();
  });

  it.each([
    ['true', encodeAbiParameters([{ type: 'bool' }], [true])],
    ['no return data', '0x'],
  ])('broadcasts after a successful %s simulation', async (_label, data) => {
    mocks.publicClient.call.mockResolvedValue({ data });

    await send(
      RECIPIENT,
      '1',
      PRIVATE_KEY,
      { token: TOKEN },
      'base',
    );

    expect(mocks.walletClient.writeContract).toHaveBeenCalledOnce();
    expect(mocks.publicClient.waitForTransactionReceipt).toHaveBeenCalledOnce();
  });
});
