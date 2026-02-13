export const MCV2_BOND_ABI = [
  {
    "type": "function",
    "name": "tokenBond",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "creator",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "mintRoyalty",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "burnRoyalty",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "createdAt",
        "type": "uint40",
        "internalType": "uint40"
      },
      {
        "name": "reserveToken",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "reserveBalance",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "createToken",
    "inputs": [
      {
        "name": "tokenParam",
        "type": "tuple",
        "internalType": "struct MCV2_Bond.TokenParam",
        "components": [
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "symbol",
            "type": "string",
            "internalType": "string"
          }
        ]
      },
      {
        "name": "bondParam",
        "type": "tuple",
        "internalType": "struct MCV2_Bond.BondParam",
        "components": [
          {
            "name": "mintRoyalty",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "burnRoyalty",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "reserveToken",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "maxSupply",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "stepRanges",
            "type": "uint128[]",
            "internalType": "uint128[]"
          },
          {
            "name": "stepPrices",
            "type": "uint128[]",
            "internalType": "uint128[]"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "mint",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokensToMint",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxReserveAmount",
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
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "burn",
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
        "name": "minRefund",
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
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getReserveForToken",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokensToMint",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "reserveAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "royalty",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRefundForTokens",
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
      }
    ],
    "outputs": [
      {
        "name": "refundAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "royalty",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getSteps",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple[]",
        "internalType": "struct MCV2_Bond.BondingCurveStep[]",
        "components": [
          {
            "name": "rangeTo",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "price",
            "type": "uint128",
            "internalType": "uint128"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxSupply",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint128",
        "internalType": "uint128"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "creationFee",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "tokens",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  }
] as const;