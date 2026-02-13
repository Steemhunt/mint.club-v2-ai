import { type Address, formatUnits } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { BOND, tokenDecimals } from '../config/contracts';
import { BOND_ABI } from '../abi/bond';
import { parse, shortHash, txUrl } from '../utils/format';
import { saveToken } from '../utils/tokens';
import { ensureApproval } from '../utils/approve';
import { getSymbol } from '../utils/symbol';

export async function buy(token: Address, amount: string, maxCost: string | undefined, privateKey: `0x${string}`) {
  const pub = getPublicClient();
  const wallet = getWalletClient(privateKey);
  const account = wallet.account;
  const tokensToMint = parse(amount);

  // Get token info
  const bondData = await pub.readContract({ address: BOND, abi: BOND_ABI, functionName: 'tokenBond', args: [token] });
  const reserveToken = bondData[4] as Address;
  const [tokenSym, reserveSym] = await Promise.all([getSymbol(pub, token), getSymbol(pub, reserveToken)]);
  const reserveDec = tokenDecimals(reserveToken);
  const fmtR = (v: bigint) => formatUnits(v, reserveDec);

  console.log(`🛒 Buying ${amount} ${tokenSym}...`);
  const [reserveAmount, royalty] = await pub.readContract({ address: BOND, abi: BOND_ABI, functionName: 'getReserveForToken', args: [token, tokensToMint] });
  const totalCost = reserveAmount + royalty;
  console.log(`   Cost: ${fmtR(reserveAmount)} + ${fmtR(royalty)} royalty = ${fmtR(totalCost)} ${reserveSym}`);
  if (maxCost && totalCost > parse(maxCost)) throw new Error(`Cost ${fmtR(totalCost)} ${reserveSym} exceeds max ${maxCost}`);

  await ensureApproval(pub, wallet, reserveToken, BOND, totalCost);
  const args = [token, tokensToMint, totalCost, account.address] as const;
  await pub.simulateContract({ account, address: BOND, abi: BOND_ABI, functionName: 'mint', args });
  console.log('📤 Sending...');
  const hash = await wallet.writeContract({ address: BOND, abi: BOND_ABI, functionName: 'mint', args });
  console.log(`   TX: ${shortHash(hash)}`);
  console.log(`   ${txUrl(hash)}`);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status === 'success') { saveToken(token); console.log(`✅ Bought ${amount} ${tokenSym} for ${fmtR(totalCost)} ${reserveSym}`); }
  else throw new Error('Transaction failed');
}
