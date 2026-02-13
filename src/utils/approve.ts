import { type Address, maxUint256 } from 'viem';
import { ERC20_ABI } from '../abi/erc20';

const APPROVE_ABI = [
  ...ERC20_ABI,
  { type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
] as const;

/** Ensure `spender` has enough allowance for `amount`. Approves max if needed. */
export async function ensureApproval(
  pub: any, wallet: any, token: Address, spender: Address, amount: bigint,
) {
  const owner = wallet.account.address;
  const allowance = await pub.readContract({
    address: token, abi: APPROVE_ABI, functionName: 'allowance', args: [owner, spender],
  }) as bigint;

  if (allowance >= amount) return;

  console.log('🔓 Approving...');
  const hash = await wallet.writeContract({
    address: token, abi: APPROVE_ABI, functionName: 'approve', args: [spender, maxUint256],
  });
  await pub.waitForTransactionReceipt({ hash });
}
