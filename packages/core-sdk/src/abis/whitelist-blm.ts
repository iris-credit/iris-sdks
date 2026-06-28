export const whitelistBlmAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "iris",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "IRIS",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IIris",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "bondRequirement",
    inputs: [
      {
        name: "quote",
        type: "tuple",
        internalType: "struct Quote",
        components: [
          {
            name: "borrower",
            type: "address",
            internalType: "address",
          },
          {
            name: "solver",
            type: "address",
            internalType: "address",
          },
          {
            name: "receiver",
            type: "address",
            internalType: "address",
          },
          {
            name: "blm",
            type: "address",
            internalType: "address",
          },
          {
            name: "collateralToken",
            type: "address",
            internalType: "address",
          },
          {
            name: "debtToken",
            type: "address",
            internalType: "address",
          },
          {
            name: "collateral",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "debt",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "fixedRate",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "duration",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "overdueRate",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "overduePeriod",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "bond",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "bondLltv",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "venueBitmap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "venueId",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "deadline",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "nonce",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "data",
            type: "bytes",
            internalType: "bytes",
          },
        ],
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "intercept",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isWhitelisted",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setIsWhitelisted",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address",
      },
      {
        name: "newIsWhitelisted",
        type: "bool",
        internalType: "bool",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setParams",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address",
      },
      {
        name: "newSlope",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "newIntercept",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "slope",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "SetIsWhitelisted",
    inputs: [
      {
        name: "account",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "isWhitelisted",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SetParams",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "newSlope",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "newIntercept",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "ParamsTooHigh",
    inputs: [],
  },
  {
    type: "error",
    name: "Unauthorized",
    inputs: [],
  },
  {
    type: "error",
    name: "ZeroAddress",
    inputs: [],
  },
  {
    type: "error",
    name: "ZeroAmount",
    inputs: [],
  },
] as const;
