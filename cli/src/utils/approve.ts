import { type Address, maxUint256 } from 'viem';
import { ERC20_ABI } from '../abi/erc20';

const APPROVE_ABI = [
  ...ERC20_ABI,
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;

const ERC1155_APPROVAL_ABI = [
  {
    type: 'function',
    name: 'isApprovedForAll',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'setApprovalForAll',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
] as const;

async function waitForApproval(pub: any, hash: `0x${string}`): Promise<void> {
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new Error('Approval transaction failed');
  }
}

async function writeApproval(
  pub: any,
  wallet: any,
  token: Address,
  spender: Address,
  amount: bigint,
): Promise<void> {
  const hash = await wallet.writeContract({
    address: token,
    abi: APPROVE_ABI,
    functionName: 'approve',
    args: [spender, amount],
  });
  await waitForApproval(pub, hash);
}

/** Ensure `spender` has enough allowance for `amount`. Approves max if needed. */
export async function ensureApproval(
  pub: any,
  wallet: any,
  token: Address,
  spender: Address,
  amount: bigint,
): Promise<void> {
  const owner = wallet.account.address;
  const allowance = await pub.readContract({
    address: token,
    abi: APPROVE_ABI,
    functionName: 'allowance',
    args: [owner, spender],
  }) as bigint;

  if (allowance >= amount) return;

  console.log('🔓 Approving...');
  if (allowance > 0n) {
    await writeApproval(pub, wallet, token, spender, 0n);
  }
  await writeApproval(pub, wallet, token, spender, maxUint256);
}

/** Ensure `operator` is approved to transfer the owner's ERC-1155 tokens. */
export async function ensureERC1155Approval(
  pub: any,
  wallet: any,
  token: Address,
  operator: Address,
): Promise<void> {
  const owner = wallet.account.address;
  const approved = await pub.readContract({
    address: token,
    abi: ERC1155_APPROVAL_ABI,
    functionName: 'isApprovedForAll',
    args: [owner, operator],
  }) as boolean;

  if (approved) return;

  console.log('🔓 Approving...');
  const hash = await wallet.writeContract({
    address: token,
    abi: ERC1155_APPROVAL_ABI,
    functionName: 'setApprovalForAll',
    args: [operator, true],
  });
  await waitForApproval(pub, hash);
}
