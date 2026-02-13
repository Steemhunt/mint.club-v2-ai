import { getPublicClient } from '../client.js';
import { getBondAddress } from '../config/contracts.js';
import { MCV2_BOND_ABI } from '../abi/bond.js';
import { formatTokenInfo, formatAmount } from '../utils/format.js';
import type { SupportedChain } from '../config/chains.js';

// ERC20 ABI for name, symbol, totalSupply, decimals
const ERC20_ABI = [
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [{ name: '', type: 'string', internalType: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string', internalType: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8', internalType: 'uint8' }],
    stateMutability: 'view',
  },
] as const;

export async function getTokenInfo(tokenAddress: `0x${string}`, chain: SupportedChain) {
  const client = getPublicClient(chain);
  const bondAddress = getBondAddress(chain);

  try {
    // Get token basic info
    const [name, symbol, totalSupply, decimals] = await client.multicall({
      contracts: [
        {
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'name',
        },
        {
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'symbol',
        },
        {
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'totalSupply',
        },
        {
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'decimals',
        },
      ],
    });

    // Get bond info
    const [bondInfo, maxSupply, steps] = await client.multicall({
      contracts: [
        {
          address: bondAddress,
          abi: MCV2_BOND_ABI,
          functionName: 'tokenBond',
          args: [tokenAddress],
        },
        {
          address: bondAddress,
          abi: MCV2_BOND_ABI,
          functionName: 'maxSupply',
          args: [tokenAddress],
        },
        {
          address: bondAddress,
          abi: MCV2_BOND_ABI,
          functionName: 'getSteps',
          args: [tokenAddress],
        },
      ],
    });

    if (bondInfo.status === 'failure') {
      throw new Error('Token not found or not a Mint Club token');
    }

    const tokenInfo = {
      name: name.result || 'Unknown',
      symbol: symbol.result || 'Unknown',
      address: tokenAddress,
      creator: bondInfo.result[0],
      reserveToken: bondInfo.result[4],
      reserveBalance: bondInfo.result[5],
      currentSupply: totalSupply.result || 0n,
      maxSupply: maxSupply.result || 0n,
      mintRoyalty: bondInfo.result[1],
      burnRoyalty: bondInfo.result[2],
      createdAt: Number(bondInfo.result[3]),
      steps: steps.result || [],
    };

    return tokenInfo;
  } catch (error) {
    throw new Error(`Failed to fetch token info: ${error instanceof Error ? error.message : error}`);
  }
}

export async function infoCommand(tokenAddress: string, chain: SupportedChain) {
  try {
    console.log(`🔍 Fetching token info for ${tokenAddress} on ${chain}...`);
    
    const tokenInfo = await getTokenInfo(tokenAddress as `0x${string}`, chain);
    
    console.log('\n' + formatTokenInfo(tokenInfo));

    // Show current price if there's supply
    if (tokenInfo.currentSupply > 0n && tokenInfo.steps.length > 0) {
      const client = getPublicClient(chain);
      const bondAddress = getBondAddress(chain);
      
      try {
        const [reserveFor1Token] = await client.readContract({
          address: bondAddress,
          abi: MCV2_BOND_ABI,
          functionName: 'getReserveForToken',
          args: [tokenAddress as `0x${string}`, 1n * (10n ** 18n)], // 1 token with 18 decimals
        });
        
        console.log(`\n💱 Current Price: ${formatAmount(reserveFor1Token)} reserve tokens per 1 ${tokenInfo.symbol}`);
      } catch (priceError) {
        console.log('\n⚠️  Could not fetch current price');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}