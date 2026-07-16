export const ZAP_V2_ABI = [
  {
    type: 'function',
    name: 'zapMint',
    stateMutability: 'payable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'inputToken', type: 'address' },
      { name: 'inputAmount', type: 'uint256' },
      { name: 'minTokensOut', type: 'uint256' },
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'tokensReceived', type: 'uint256' },
      { name: 'reserveObtained', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'zapBurn',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'outputToken', type: 'address' },
      { name: 'minOutputAmount', type: 'uint256' },
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'outputReceived', type: 'uint256' }],
  },
] as const;
