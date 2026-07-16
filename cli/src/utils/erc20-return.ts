import {
  decodeAbiParameters,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';

/**
 * Simulate a state-changing ERC-20 call and enforce its optional bool result.
 * Legacy tokens that return no data remain supported; an explicit false fails closed.
 */
export async function assertErc20CallSucceeds(
  client: Pick<PublicClient, 'call'>,
  account: Address,
  token: Address,
  data: Hex,
  operation: string,
): Promise<void> {
  const response = await client.call({ account, to: token, data });
  if (!response.data || response.data === '0x') return;

  let succeeded: boolean;
  try {
    [succeeded] = decodeAbiParameters([{ type: 'bool' }], response.data);
  } catch {
    throw new Error(`ERC-20 ${operation} returned invalid data`);
  }

  if (!succeeded) {
    throw new Error(`ERC-20 ${operation} returned false`);
  }
}