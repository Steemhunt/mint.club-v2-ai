export const BOND_ABI = [
  {
    type: 'function', name: 'tokenBond', stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'creator', type: 'address' },
      { name: 'mintRoyalty', type: 'uint16' },
      { name: 'burnRoyalty', type: 'uint16' },
      { name: 'createdAt', type: 'uint40' },
      { name: 'reserveToken', type: 'address' },
      { name: 'reserveBalance', type: 'uint256' },
    ],
  },
  {
    type: 'function', name: 'createToken', stateMutability: 'payable',
    inputs: [
      {
        name: 'tp', type: 'tuple',
        components: [
          { name: 'name', type: 'string' },
          { name: 'symbol', type: 'string' },
        ],
      },
      {
        name: 'bp', type: 'tuple',
        components: [
          { name: 'mintRoyalty', type: 'uint16' },
          { name: 'burnRoyalty', type: 'uint16' },
          { name: 'reserveToken', type: 'address' },
          { name: 'maxSupply', type: 'uint128' },
          { name: 'stepRanges', type: 'uint128[]' },
          { name: 'stepPrices', type: 'uint128[]' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function', name: 'mint', stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokensToMint', type: 'uint256' },
      { name: 'maxReserveAmount', type: 'uint256' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'burn', stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokensToBurn', type: 'uint256' },
      { name: 'minRefund', type: 'uint256' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'getReserveForToken', stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokensToMint', type: 'uint256' },
    ],
    outputs: [
      { name: 'reserveAmount', type: 'uint256' },
      { name: 'royalty', type: 'uint256' },
    ],
  },
  {
    type: 'function', name: 'getRefundForTokens', stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokensToBurn', type: 'uint256' },
    ],
    outputs: [
      { name: 'refundAmount', type: 'uint256' },
      { name: 'royalty', type: 'uint256' },
    ],
  },
  {
    type: 'function', name: 'getSteps', stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{
      name: '', type: 'tuple[]',
      components: [
        { name: 'rangeTo', type: 'uint128' },
        { name: 'price', type: 'uint128' },
      ],
    }],
  },
  {
    type: 'function', name: 'maxSupply', stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'uint128' }],
  },
  {
    type: 'function', name: 'creationFee', stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'tokenImplementation', stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;
