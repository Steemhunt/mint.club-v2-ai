export const MCV2_ZAP_V2_ABI = [
  {
    "type": "function",
    "name": "zapMint",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "inputToken",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "inputAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minTokensOut",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "commands",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "inputs",
        "type": "bytes[]",
        "internalType": "bytes[]"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "tokensReceived",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "reserveUsed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "zapBurn",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokensToBurn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "outputToken",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "minOutputAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "commands",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "inputs",
        "type": "bytes[]",
        "internalType": "bytes[]"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "outputAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "reserveReceived",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  }
] as const;