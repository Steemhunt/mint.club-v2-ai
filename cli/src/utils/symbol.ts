import { type Address } from 'viem';
import { getTokens } from '../config/contracts';
import type { SupportedChain } from '../config/chains';
import { ERC20_ABI } from '../abi/erc20';

/** Get decimals for a token address. Checks chain metadata before RPC. */
export async function getDecimals(
  pub: any,
  address: Address,
  chain: SupportedChain = 'base',
): Promise<number> {
  const known = getTokens(chain).find(
    (token) => token.address.toLowerCase() === address.toLowerCase(),
  );
  if (known) return known.decimals;

  return Number(
    await pub.readContract({
      address,
      abi: ERC20_ABI,
      functionName: 'decimals',
    }),
  );
}

/** Get symbol for a token address. Checks the selected chain's known list first. */
export async function getSymbol(
  pub: any,
  address: Address,
  chain: SupportedChain = 'base',
): Promise<string> {
  const known = getTokens(chain).find(
    (token) => token.address.toLowerCase() === address.toLowerCase(),
  );
  if (known) return known.symbol;
  try {
    return (await pub.readContract({
      address,
      abi: ERC20_ABI,
      functionName: 'symbol',
    })) as string;
  } catch {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
}
