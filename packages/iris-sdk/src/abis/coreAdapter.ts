export const coreAdapterAbi = [
  { type: "receive", stateMutability: "payable" },
  {
    type: "function",
    name: "BUNDLER3",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "erc20Transfer",
    inputs: [
      { name: "token", type: "address", internalType: "address" },
      { name: "receiver", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "nativeTransfer",
    inputs: [
      { name: "receiver", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  { type: "error", name: "AdapterAddress", inputs: [] },
  { type: "error", name: "UnauthorizedSender", inputs: [] },
  { type: "error", name: "ZeroAddress", inputs: [] },
  { type: "error", name: "ZeroAmount", inputs: [] },
] as const;
