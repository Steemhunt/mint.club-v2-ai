import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';

const TOKEN = '0x1234567890123456789012345678901234567890' as Address;
const RESERVE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const ACCOUNT = '0x1111111111111111111111111111111111111111' as Address;
const PRIVATE_KEY = `0x${'1'.repeat(64)}` as `0x${string}`;

const mocks = vi.hoisted(() => ({
  setupClients: vi.fn(),
  executeTransaction: vi.fn(),
  getBondInfo: vi.fn(),
  getMintCost: vi.fn(),
  getBurnRefund: vi.fn(),
  getDecimals: vi.fn(),
  getSymbol: vi.fn(),
  ensureApproval: vi.fn(),
  ensureERC1155Approval: vi.fn(),
}));

vi.mock('../src/client', () => ({
  getPublicClient: vi.fn(),
  getWalletClient: vi.fn(),
}));
vi.mock('../src/utils/transaction', () => ({
  setupClients: mocks.setupClients,
  executeTransaction: mocks.executeTransaction,
}));
vi.mock('../src/utils/bond', () => ({
  getBondInfo: mocks.getBondInfo,
  getMintCost: mocks.getMintCost,
  getBurnRefund: mocks.getBurnRefund,
  resolveMintLimit: (quoted: bigint) => quoted,
  resolveBurnLimit: (quoted: bigint) => quoted,
}));
vi.mock('../src/utils/symbol', () => ({
  getDecimals: mocks.getDecimals,
  getSymbol: mocks.getSymbol,
}));
vi.mock('../src/utils/approve', () => ({
  ensureApproval: mocks.ensureApproval,
  ensureERC1155Approval: mocks.ensureERC1155Approval,
}));

const [{ buy }, { sell }] = await Promise.all([
  import('../src/commands/buy'),
  import('../src/commands/sell'),
]);

describe('direct ERC-1155 Bond commands', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.setupClients.mockReturnValue({
      publicClient: {},
      walletClient: {},
      account: ACCOUNT,
    });
    mocks.getBondInfo.mockResolvedValue({
      reserveToken: RESERVE,
      reserveDecimals: 6,
      reserveSymbol: 'USDC',
      formatReserve: (value: bigint) => String(value),
    });
    mocks.getDecimals.mockResolvedValue(0);
    mocks.getSymbol.mockResolvedValue('MT');
    mocks.getMintCost.mockResolvedValue({
      reserveAmount: 100n,
      royalty: 10n,
      totalCost: 100n,
    });
    mocks.getBurnRefund.mockResolvedValue({
      refundAmount: 90n,
      royalty: 10n,
      netRefund: 90n,
    });
  });

  it('parses direct buy amounts as whole ERC-1155 units', async () => {
    await buy(TOKEN, '2', undefined, PRIVATE_KEY);

    expect(mocks.getMintCost).toHaveBeenCalledWith(
      expect.anything(),
      TOKEN,
      2n,
      'base',
    );
    expect(mocks.executeTransaction.mock.calls[0][3]).toEqual(
      expect.objectContaining({
        functionName: 'mint',
        args: [TOKEN, 2n, 100n, ACCOUNT],
      }),
    );
  });

  it('uses ERC-1155 operator approval for direct sells', async () => {
    await sell(TOKEN, '2', undefined, PRIVATE_KEY);

    expect(mocks.getBurnRefund).toHaveBeenCalledWith(
      expect.anything(),
      TOKEN,
      2n,
      'base',
    );
    expect(mocks.ensureERC1155Approval).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      TOKEN,
      expect.any(String),
    );
    expect(mocks.ensureApproval).not.toHaveBeenCalled();
    expect(mocks.executeTransaction.mock.calls[0][3]).toEqual(
      expect.objectContaining({
        functionName: 'burn',
        args: [TOKEN, 2n, 90n, ACCOUNT],
      }),
    );
  });

  it('rejects fractional ERC-1155 amounts before quotes or approvals', async () => {
    await expect(buy(TOKEN, '1.5', undefined, PRIVATE_KEY)).rejects.toThrow();

    expect(mocks.getMintCost).not.toHaveBeenCalled();
    expect(mocks.ensureApproval).not.toHaveBeenCalled();
    expect(mocks.ensureERC1155Approval).not.toHaveBeenCalled();
  });
});
