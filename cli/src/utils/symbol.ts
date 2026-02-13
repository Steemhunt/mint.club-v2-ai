import { type Address } from 'viem';
import { TOKENS } from '../config/contracts';
import { ERC20_ABI } from '../abi/erc20';

/** Get symbol for a token address. Checks known list first, then reads on-chain. */
export async function getSymbol(pub: any, address: Address): Promise<string> {
  const known = TOKENS.find(t => t.address.toLowerCase() === address.toLowerCase());
  if (known) return known.symbol;
  try {
    return await pub.readContract({ address, abi: ERC20_ABI, functionName: 'symbol' }) as string;
  } catch {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
}
