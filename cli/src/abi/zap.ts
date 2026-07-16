export const ZAP_ABI = [
  {
    type: 'function',
    name: 'BOND',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'WETH',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'mintWithEth',
    stateMutability: 'payable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokensToMint', type: 'uint256' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'burnToEth',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokensToBurn', type: 'uint256' },
      { name: 'minRefund', type: 'uint256' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [],
  },
] as const;
