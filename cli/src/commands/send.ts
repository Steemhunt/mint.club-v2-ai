import { encodeFunctionData, type Address, parseEther } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import {
  CHAIN_CONFIGS,
  ZERO_ADDRESS,
  type SupportedChain,
} from '../config/chains';
import { ERC20_ABI } from '../abi/erc20';
import { assertErc20CallSucceeds } from '../utils/erc20-return';
import { parse, shortHash, shortAddr, txUrl } from '../utils/format';

const ERC1155_ABI = [
  {
    type: 'function',
    name: 'safeTransferFrom',
    stateMutability: 'nonpayable',
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
  to: Address,
  amount: string,
  privateKey: `0x${string}`,
  opts: { token?: Address; tokenId?: string },
  chain: SupportedChain = 'base',
) {
  if (
    opts.tokenId !== undefined &&
    (!opts.token || opts.token.toLowerCase() === ZERO_ADDRESS.toLowerCase())
  ) {
    throw new Error('tokenId requires an ERC-1155 contract address');
  }

  const publicClient = getPublicClient(chain);
  const walletClient = getWalletClient(privateKey, chain);
  const account = walletClient.account;
  const chainName = CHAIN_CONFIGS[chain].chain.name;

  if (opts.token && opts.tokenId !== undefined) {
    const tokenId = BigInt(opts.tokenId);
    const quantity = BigInt(amount);
    console.log(
      `📦 Sending ${quantity} of ERC-1155 #${tokenId} (${shortAddr(opts.token)}) to ${shortAddr(to)} on ${chainName}...`,
    );
    const hash = await walletClient.writeContract({
      address: opts.token,
      abi: ERC1155_ABI,
      functionName: 'safeTransferFrom',
      args: [account.address, to, tokenId, quantity, '0x'],
    });
    console.log(`   TX: ${shortHash(hash)}`);
    console.log(`   ${txUrl(hash, chain)}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error('Transaction failed');
    console.log(`✅ Sent (block ${receipt.blockNumber})`);
    return;
  }

  if (opts.token) {
    const [decimals, symbol] = await Promise.all([
      publicClient.readContract({
        address: opts.token,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
      publicClient
        .readContract({
          address: opts.token,
          abi: ERC20_ABI,
          functionName: 'symbol',
        })
        .catch(() => 'tokens'),
    ]);
    const value = parse(amount, decimals);
    console.log(
      `💸 Sending ${amount} ${symbol} (${shortAddr(opts.token)}) to ${shortAddr(to)} on ${chainName}...`,
    );
    const transfer = {
      address: opts.token,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [to, value],
    } as const;
    await assertErc20CallSucceeds(
      publicClient,
      account.address,
      opts.token,
      encodeFunctionData(transfer),
      'transfer',
    );
    const hash = await walletClient.writeContract(transfer);
    console.log(`   TX: ${shortHash(hash)}`);
    console.log(`   ${txUrl(hash, chain)}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error('Transaction failed');
    console.log(`✅ Sent (block ${receipt.blockNumber})`);
    return;
  }

  const value = parseEther(amount);
  const nativeSymbol = CHAIN_CONFIGS[chain].chain.nativeCurrency.symbol;
  console.log(
    `💸 Sending ${amount} ${nativeSymbol} to ${shortAddr(to)} on ${chainName}...`,
  );
  const hash = await walletClient.sendTransaction({ to, value });
  console.log(`   TX: ${shortHash(hash)}`);
  console.log(`   ${txUrl(hash, chain)}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('Transaction failed');
  console.log(`✅ Sent (block ${receipt.blockNumber})`);
}
