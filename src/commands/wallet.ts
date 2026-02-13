import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { formatUnits } from 'viem';
import { resolve } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { getPublicClient } from '../client';
import { ERC20_ABI } from '../abi/erc20';
import { TOKENS, WETH, BOND } from '../config/contracts';
import { BOND_ABI } from '../abi/bond';
import { getUsdPrice } from '../utils/price';
import { loadTokens } from '../utils/tokens';

const ENV_DIR = resolve(homedir(), '.mintclub');
const ENV_PATH = resolve(ENV_DIR, '.env');

function printKeyWarning() {
  console.log('⚠️  WARNING: Back up your private key in a secure, encrypted location!');
  console.log('   If you lose ~/.mintclub/.env or your private key, your funds are');
  console.log('   gone forever — there is no way to recover them.');
  console.log('   If your key is leaked, anyone can drain your wallet immediately.');
}

export async function wallet(opts: { generate?: boolean; setPrivateKey?: string }) {
  if (opts.setPrivateKey) {
    const key = (opts.setPrivateKey.startsWith('0x') ? opts.setPrivateKey : `0x${opts.setPrivateKey}`) as `0x${string}`;
    const account = privateKeyToAccount(key);
    mkdirSync(ENV_DIR, { recursive: true });
    if (existsSync(ENV_PATH)) {
      const content = readFileSync(ENV_PATH, 'utf-8');
      if (content.includes('PRIVATE_KEY=')) writeFileSync(ENV_PATH, content.replace(/PRIVATE_KEY=.*/g, `PRIVATE_KEY=${key}`));
      else writeFileSync(ENV_PATH, content + (content.endsWith('\n') || !content ? '' : '\n') + `PRIVATE_KEY=${key}\n`);
    } else writeFileSync(ENV_PATH, `PRIVATE_KEY=${key}\n`);
    console.log(`✅ Private key saved!\n\n   Address: ${account.address}\n   Saved to: ~/.mintclub/.env\n`);
    printKeyWarning();
    return;
  }

  if (opts.generate) {
    if (existsSync(ENV_PATH) && readFileSync(ENV_PATH, 'utf-8').includes('PRIVATE_KEY=')) {
      console.error('⚠️  PRIVATE_KEY already exists in ~/.mintclub/.env\n   Delete it manually if you want to generate a new one.');
      process.exit(1);
    }
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    mkdirSync(ENV_DIR, { recursive: true });
    const content = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf-8') : '';
    writeFileSync(ENV_PATH, content + (content.endsWith('\n') || !content ? '' : '\n') + `PRIVATE_KEY=${key}\n`);
    console.log(`✅ New wallet created!\n\n   Address: ${account.address}\n   Saved to: ~/.mintclub/.env\n\n💰 Fund this address to start using mc buy/sell/create.\n`);
    printKeyWarning();
    return;
  }

  const key = process.env.PRIVATE_KEY;
  if (!key) { console.log('No wallet configured.\n\nRun `mc wallet --generate` to create one, or add PRIVATE_KEY to ~/.mintclub/.env'); return; }

  const pk = (key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`;
  const account = privateKeyToAccount(pk);
  console.log(`👛 Wallet: ${account.address}\n`);

  const client = getPublicClient();
  const ethBalance = await client.getBalance({ address: account.address });

  // Fetch all ERC20 token balances (skip ETH — not an ERC20)
  const erc20Tokens = TOKENS.filter(t => t.symbol !== 'ETH');
  const results = await client.multicall({
    contracts: erc20Tokens.map(t => ({ address: t.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] })),
  });

  // Get USD prices for ETH + all tokens with balances
  const ethUsd = await getUsdPrice(WETH);
  const fmtUsd = (v: number) => v < 0.01 ? v.toExponential(2) : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  let totalUsd = 0;
  const ethVal = Number(formatUnits(ethBalance, 18));
  const ethUsdVal = ethUsd !== null ? ethVal * ethUsd : null;
  if (ethUsdVal !== null) totalUsd += ethUsdVal;

  console.log(`💰 Balances on Base:\n`);
  console.log(`   ETH: ${formatUnits(ethBalance, 18)}${ethUsdVal !== null ? ` (~$${fmtUsd(ethUsdVal)})` : ''}`);

  for (let i = 0; i < erc20Tokens.length; i++) {
    const bal = results[i].status === 'success' ? results[i].result as bigint : 0n;
    if (bal > 0n) {
      const amount = Number(formatUnits(bal, erc20Tokens[i].decimals));
      const tokenUsd = await getUsdPrice(erc20Tokens[i].address);
      const usdVal = tokenUsd !== null ? amount * tokenUsd : null;
      if (usdVal !== null) totalUsd += usdVal;
      console.log(`   ${erc20Tokens[i].symbol}: ${formatUnits(bal, erc20Tokens[i].decimals)}${usdVal !== null ? ` (~$${fmtUsd(usdVal)})` : ''}`);
    }
  }

  // Show balances for saved Mint Club tokens
  const savedTokens = loadTokens();
  const knownAddrs = new Set(TOKENS.map(t => t.address.toLowerCase()));
  const mcTokens = savedTokens.filter(t => !knownAddrs.has(t.toLowerCase()));

  if (mcTokens.length > 0) {
    // Batch: balanceOf + symbol + tokenBond for each
    const mcResults = await client.multicall({
      contracts: mcTokens.flatMap(t => [
        { address: t, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] },
        { address: t, abi: ERC20_ABI, functionName: 'symbol' },
        { address: BOND, abi: BOND_ABI, functionName: 'tokenBond', args: [t] },
      ]),
    });

    let hasMcHeader = false;
    for (let i = 0; i < mcTokens.length; i++) {
      const bal = mcResults[i * 3].status === 'success' ? mcResults[i * 3].result as bigint : 0n;
      if (bal === 0n) continue;

      if (!hasMcHeader) { console.log(`\n🪙 Mint Club Tokens:\n`); hasMcHeader = true; }

      const sym = mcResults[i * 3 + 1].status === 'success' ? mcResults[i * 3 + 1].result as string : mcTokens[i].slice(0, 10);
      let line = `   ${sym}: ${formatUnits(bal, 18)}`;

      // Try to get USD price via bond + 1inch
      if (mcResults[i * 3 + 2].status === 'success') {
        const [, , , , reserveToken] = mcResults[i * 3 + 2].result as any;
        try {
          const [costFor1] = await client.readContract({
            address: BOND, abi: BOND_ABI, functionName: 'getReserveForToken', args: [mcTokens[i] as `0x${string}`, 10n ** 18n],
          });
          const reserveUsd = await getUsdPrice(reserveToken);
          if (reserveUsd !== null) {
            const reserveDecimals = TOKENS.find(t => t.address.toLowerCase() === reserveToken.toLowerCase())?.decimals ?? 18;
            const tokenUsd = (Number(costFor1) / 10 ** reserveDecimals) * reserveUsd;
            const val = (Number(bal) / 1e18) * tokenUsd;
            totalUsd += val;
            line += ` (~$${fmtUsd(val)})`;
          }
        } catch {}
      }
      console.log(line);
    }
  }

  if (totalUsd > 0) console.log(`\n💵 Total: ~$${fmtUsd(totalUsd)}`);
}
