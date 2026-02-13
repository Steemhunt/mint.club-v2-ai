export const ZAP_V2_ABI = [
  {
    type: 'function', name: 'zapMint', stateMutability: 'payable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'inputToken', type: 'address' },
      { name: 'inputAmount', type: 'uint256' },
      { name: 'minTokensOut', type: 'uint256' },
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [
      { name: 'tokensReceived', type: 'uint256' },
      { name: 'reserveUsed', type: 'uint256' },
    ],
  },
  {
    type: 'function', name: 'zapBurn', stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokensToBurn', type: 'uint256' },
      { name: 'outputToken', type: 'address' },
      { name: 'minOutputAmount', type: 'uint256' },
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [
      { name: 'outputAmount', type: 'uint256' },
      { name: 'reserveReceived', type: 'uint256' },
    ],
  },
] as const;
