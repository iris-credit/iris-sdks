export const venueAdapterAbi = [
  {
    type: "function",
    name: "indices",
    inputs: [
      { name: "collateralToken", type: "address" },
      { name: "debtToken", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [
      { name: "collateralIndex", type: "uint256" },
      { name: "debtIndex", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lltv",
    inputs: [
      { name: "collateralToken", type: "address" },
      { name: "debtToken", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ name: "lltv", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "price",
    inputs: [
      { name: "collateralToken", type: "address" },
      { name: "debtToken", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ name: "price", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "positionAssets",
    inputs: [
      { name: "pod", type: "address" },
      { name: "collateralToken", type: "address" },
      { name: "debtToken", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [
      { name: "collateral", type: "uint256" },
      { name: "debt", type: "uint256" },
    ],
    stateMutability: "view",
  },
] as const;
