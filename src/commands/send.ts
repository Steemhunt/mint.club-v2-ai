import { type Address, parseEther } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { ERC20_ABI } from '../abi/erc20';
import { parse, fmt, shortHash, shortAddr } from '../utils/format';
import type { SupportedChain } from '../config/chains';

const ERC1155_ABI = [
  {
    type: 'function', name: 'safeTransferFrom', stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'id', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

export async function send(
  to: Address, amount: string,
  chain: SupportedChain, privateKey: `0x${string}`,
  opts: { token?: Address; tokenId?: string },
) {
  const pub = getPublicClient(chain);
  const wallet = getWalletClient(chain, privateKey);
  const account = wallet.account;

  // ERC-1155
  if (opts.token && opts.tokenId) {
    const tokenId = BigInt(opts.tokenId);
    const qty = BigInt(amount);
    console.log(`📦 Sending ${qty} of ERC-1155 #${tokenId} (${shortAddr(opts.token)}) to ${shortAddr(to)} on ${chain}...`);

    const hash = await wallet.writeContract({
      address: opts.token, abi: ERC1155_ABI, functionName: 'safeTransferFrom',
      args: [account.address, to, tokenId, qty, '0x'],
    });
    console.log(`   TX: ${shortHash(hash)}`);

    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status === 'success') {
      console.log(`✅ Sent (block ${receipt.blockNumber})`);
    } else {
      throw new Error('Transaction failed');
    }
    return;
  }

  // ERC-20
  if (opts.token) {
    const [decimals, symbol] = await Promise.all([
      pub.readContract({ address: opts.token, abi: ERC20_ABI, functionName: 'decimals' }),
      pub.readContract({ address: opts.token, abi: ERC20_ABI, functionName: 'symbol' }).catch(() => 'tokens'),
    ]);
    const value = parse(amount, decimals as number);
    console.log(`💸 Sending ${amount} ${symbol} (${shortAddr(opts.token)}) to ${shortAddr(to)} on ${chain}...`);

    const hash = await wallet.writeContract({
      address: opts.token, abi: [{
        type: 'function', name: 'transfer', stateMutability: 'nonpayable',
        inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
        outputs: [{ type: 'bool' }],
      }] as const,
      functionName: 'transfer', args: [to, value],
    });
    console.log(`   TX: ${shortHash(hash)}`);

    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status === 'success') {
      console.log(`✅ Sent (block ${receipt.blockNumber})`);
    } else {
      throw new Error('Transaction failed');
    }
    return;
  }

  // Native ETH
  const value = parseEther(amount);
  console.log(`💸 Sending ${amount} ETH to ${shortAddr(to)} on ${chain}...`);

  const hash = await wallet.sendTransaction({ to, value });
  console.log(`   TX: ${shortHash(hash)}`);

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status === 'success') {
    console.log(`✅ Sent (block ${receipt.blockNumber})`);
  } else {
    throw new Error('Transaction failed');
  }
}
