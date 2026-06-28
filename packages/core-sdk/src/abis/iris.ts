export const irisAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        internalType: "address",
      },
      {
        name: "podImpl",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "DOMAIN_SEPARATOR",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "POD_IMPL",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "accrueLegsView",
    inputs: [
      {
        name: "pod",
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
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
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
    name: "claim",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "onBehalf",
        type: "address",
        internalType: "address",
      },
      {
        name: "receiver",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimable",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address",
      },
      {
        name: "account",
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
    name: "enableBlm",
    inputs: [
      {
        name: "blm",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "enableBondLltv",
    inputs: [
      {
        name: "lltv",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "enableData",
    inputs: [
      {
        name: "data",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "escape",
    inputs: [
      {
        name: "pod",
        type: "address",
        internalType: "address",
      },
      {
        name: "receiver",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "fee",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint16",
        internalType: "uint16",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "feeRecipient",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getLoan",
    inputs: [
      {
        name: "pod",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct Loan",
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
            name: "venueBitmap",
            type: "uint128",
            internalType: "uint128",
          },
          {
            name: "maturity",
            type: "uint32",
            internalType: "uint32",
          },
          {
            name: "overduePeriod",
            type: "uint32",
            internalType: "uint32",
          },
          {
            name: "fixedRate",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "overdueRate",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "bondLltv",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "fee",
            type: "uint16",
            internalType: "uint16",
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPosition",
    inputs: [
      {
        name: "pod",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct Position",
        components: [
          {
            name: "collateral",
            type: "uint128",
            internalType: "uint128",
          },
          {
            name: "debt",
            type: "uint128",
            internalType: "uint128",
          },
          {
            name: "bond",
            type: "uint128",
            internalType: "uint128",
          },
          {
            name: "bondRequirement",
            type: "uint128",
            internalType: "uint128",
          },
          {
            name: "collateralIndex",
            type: "uint128",
            internalType: "uint128",
          },
          {
            name: "debtIndex",
            type: "uint128",
            internalType: "uint128",
          },
          {
            name: "fixedLeg",
            type: "uint128",
            internalType: "uint128",
          },
          {
            name: "floatingLeg",
            type: "uint128",
            internalType: "uint128",
          },
          {
            name: "surplus",
            type: "uint128",
            internalType: "uint128",
          },
          {
            name: "lastUpdate",
            type: "uint32",
            internalType: "uint32",
          },
          {
            name: "venueId",
            type: "uint8",
            internalType: "uint8",
          },
          {
            name: "data",
            type: "bytes",
            internalType: "bytes",
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isAuthorized",
    inputs: [
      {
        name: "authorizer",
        type: "address",
        internalType: "address",
      },
      {
        name: "authorized",
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
    name: "isBlmEnabled",
    inputs: [
      {
        name: "blm",
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
    name: "isBondLltvEnabled",
    inputs: [
      {
        name: "lltv",
        type: "uint256",
        internalType: "uint256",
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
    name: "isDataEnabled",
    inputs: [
      {
        name: "data",
        type: "bytes32",
        internalType: "bytes32",
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
    name: "isNonceUsed",
    inputs: [
      {
        name: "authorizer",
        type: "address",
        internalType: "address",
      },
      {
        name: "nonce",
        type: "uint256",
        internalType: "uint256",
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
    name: "liquidate",
    inputs: [
      {
        name: "pod",
        type: "address",
        internalType: "address",
      },
      {
        name: "receiver",
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
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "liquidateBond",
    inputs: [
      {
        name: "pod",
        type: "address",
        internalType: "address",
      },
      {
        name: "receiver",
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
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "multicall",
    inputs: [
      {
        name: "data",
        type: "bytes[]",
        internalType: "bytes[]",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "permit2",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address",
      },
      {
        name: "_owner",
        type: "address",
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "deadline",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "v",
        type: "uint8",
        internalType: "uint8",
      },
      {
        name: "r",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "s",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rebase",
    inputs: [
      {
        name: "pod",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "refinance",
    inputs: [
      {
        name: "pod",
        type: "address",
        internalType: "address",
      },
      {
        name: "newVenueId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "data",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "repay",
    inputs: [
      {
        name: "pod",
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
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setAuthorization",
    inputs: [
      {
        name: "authorized",
        type: "address",
        internalType: "address",
      },
      {
        name: "newIsAuthorized",
        type: "bool",
        internalType: "bool",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setAuthorizationWithSig",
    inputs: [
      {
        name: "authorization",
        type: "tuple",
        internalType: "struct Authorization",
        components: [
          {
            name: "authorizer",
            type: "address",
            internalType: "address",
          },
          {
            name: "authorized",
            type: "address",
            internalType: "address",
          },
          {
            name: "isAuthorized",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "nonce",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "deadline",
            type: "uint256",
            internalType: "uint256",
          },
        ],
      },
      {
        name: "signature",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setFee",
    inputs: [
      {
        name: "newFee",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setFeeRecipient",
    inputs: [
      {
        name: "newFeeRecipient",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setOwner",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setVenueAdapter",
    inputs: [
      {
        name: "venueId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "adapter",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "supplyBond",
    inputs: [
      {
        name: "pod",
        type: "address",
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "supplyCollateral",
    inputs: [
      {
        name: "pod",
        type: "address",
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "take",
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
      {
        name: "signature",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "venueAdapter",
    inputs: [
      {
        name: "venueId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "adapter",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "withdrawBond",
    inputs: [
      {
        name: "pod",
        type: "address",
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "receiver",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdrawCollateral",
    inputs: [
      {
        name: "pod",
        type: "address",
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "receiver",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Accrue",
    inputs: [
      {
        name: "pod",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newCollateralIndex",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "newDebtIndex",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "fixedLeg",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "floatingLeg",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "surplus",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Claim",
    inputs: [
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "onBehalf",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "receiver",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Claimable",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "account",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "EnableBlm",
    inputs: [
      {
        name: "blm",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "EnableBondLltv",
    inputs: [
      {
        name: "lltv",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "EnableData",
    inputs: [
      {
        name: "data",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Escape",
    inputs: [
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "pod",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "receiver",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "venueCollateral",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "venueDebt",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Liquidate",
    inputs: [
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "pod",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "receiver",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "repaid",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "seized",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "badBond",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "LiquidateBond",
    inputs: [
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "pod",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "receiver",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "seized",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Rebase",
    inputs: [
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "pod",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newCollateral",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "newDebt",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "badDebt",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Refinance",
    inputs: [
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "pod",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newVenueId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "newVenueAdapter",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "data",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Repay",
    inputs: [
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "pod",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "repaid",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "badBond",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SetAuthorization",
    inputs: [
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "authorizer",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "authorized",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "isAuthorized",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SetFee",
    inputs: [
      {
        name: "newFee",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SetFeeRecipient",
    inputs: [
      {
        name: "newFeeRecipient",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SetNonce",
    inputs: [
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "authorizer",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "nonce",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SetOwner",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SetVenueAdapter",
    inputs: [
      {
        name: "venueId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "adapter",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SupplyBond",
    inputs: [
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "pod",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SupplyCollateral",
    inputs: [
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "pod",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Take",
    inputs: [
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "pod",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "quote",
        type: "tuple",
        indexed: false,
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
    anonymous: false,
  },
  {
    type: "event",
    name: "WithdrawBond",
    inputs: [
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "pod",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "receiver",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "WithdrawCollateral",
    inputs: [
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "pod",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "receiver",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "AdapterNotSet",
    inputs: [],
  },
  {
    type: "error",
    name: "AlreadySet",
    inputs: [],
  },
  {
    type: "error",
    name: "BlmNotEnabled",
    inputs: [],
  },
  {
    type: "error",
    name: "BondLltvNotEnabled",
    inputs: [],
  },
  {
    type: "error",
    name: "BondLltvTooHigh",
    inputs: [],
  },
  {
    type: "error",
    name: "CastOverflow",
    inputs: [],
  },
  {
    type: "error",
    name: "FeeTooHigh",
    inputs: [],
  },
  {
    type: "error",
    name: "FixedRateTooHigh",
    inputs: [],
  },
  {
    type: "error",
    name: "HealthyBond",
    inputs: [],
  },
  {
    type: "error",
    name: "HealthyLoan",
    inputs: [],
  },
  {
    type: "error",
    name: "InsufficientBond",
    inputs: [],
  },
  {
    type: "error",
    name: "InsufficientCollateral",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidData",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidDuration",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidNonce",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidSignature",
    inputs: [],
  },
  {
    type: "error",
    name: "LoanNotCreated",
    inputs: [],
  },
  {
    type: "error",
    name: "LoanNotResolved",
    inputs: [],
  },
  {
    type: "error",
    name: "NotAllowedVenue",
    inputs: [],
  },
  {
    type: "error",
    name: "NotMultipleOfBp",
    inputs: [],
  },
  {
    type: "error",
    name: "OverduePeriodTooHigh",
    inputs: [],
  },
  {
    type: "error",
    name: "OverdueRateTooHigh",
    inputs: [],
  },
  {
    type: "error",
    name: "QuoteExpired",
    inputs: [],
  },
  {
    type: "error",
    name: "SignatureExpired",
    inputs: [],
  },
  {
    type: "error",
    name: "Unauthorized",
    inputs: [],
  },
  {
    type: "error",
    name: "VenueIdTooHigh",
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
