import { values } from "@iris-credit/iris-ts";

export const ChainId = {
  EthMainnet: 1,
  VNet: 9991,
  // BaseMainnet: 8453,
} as const;

export type ChainId = (typeof ChainId)[keyof typeof ChainId];

export interface ChainMetadata {
  readonly name: string;
  readonly id: ChainId;
  /** Block explorer root, without a trailing slash; omitted when the chain has no explorer. */
  readonly explorerUrl?: string;
  readonly nativeCurrency: {
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
  };
  readonly identifier: string;
}

export namespace ChainUtils {
  export const toHexChainId = (chainId: ChainId) => {
    return `0x${chainId.toString(16)}`;
  };

  /**
   * Returns the chain's block explorer root, or `undefined` when the chain has none (e.g. the
   * VNet devnet), so callers can render plain text instead of a dead link.
   *
   * @param chainId - Chain whose explorer to resolve.
   * @returns The explorer root URL, or `undefined` if the chain has no explorer.
   * @example
   * ```ts
   * import { ChainId, ChainUtils } from "@iris-credit/core-sdk";
   *
   * ChainUtils.getExplorerUrl(ChainId.EthMainnet); // "https://etherscan.io"
   * ChainUtils.getExplorerUrl(ChainId.VNet); // undefined
   * ```
   */
  export const getExplorerUrl = (chainId: ChainId): string | undefined => {
    // Widened lookup: a chain without an explorer omits the key from its entry.
    const metadata: ChainMetadata = ChainUtils.CHAIN_METADATA[chainId];

    return metadata.explorerUrl;
  };

  /**
   * Returns the explorer page for `address` on `chainId`, or `undefined` when the chain has no
   * explorer.
   *
   * @param chainId - Chain whose explorer to link.
   * @param address - Account or contract address to link.
   * @returns The address page URL, or `undefined` if the chain has no explorer.
   * @example
   * ```ts
   * import { ChainId, ChainUtils } from "@iris-credit/core-sdk";
   *
   * ChainUtils.getExplorerAddressUrl(
   *   ChainId.EthMainnet,
   *   "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
   * ); // "https://etherscan.io/address/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
   * ```
   */
  export const getExplorerAddressUrl = (chainId: ChainId, address: string): string | undefined => {
    const explorerUrl = getExplorerUrl(chainId);
    if (explorerUrl == null) return;

    return `${explorerUrl}/address/${address}`;
  };

  /**
   * Returns the explorer page for transaction `tx` on `chainId`, or `undefined` when the chain
   * has no explorer.
   *
   * @param chainId - Chain whose explorer to link.
   * @param tx - Transaction hash to link.
   * @returns The transaction page URL, or `undefined` if the chain has no explorer.
   * @example
   * ```ts
   * import { ChainId, ChainUtils } from "@iris-credit/core-sdk";
   *
   * ChainUtils.getExplorerTransactionUrl(ChainId.EthMainnet, "0xabc"); // "https://etherscan.io/tx/0xabc"
   * ```
   */
  export const getExplorerTransactionUrl = (chainId: ChainId, tx: string): string | undefined => {
    const explorerUrl = getExplorerUrl(chainId);
    if (explorerUrl == null) return;

    return `${explorerUrl}/tx/${tx}`;
  };

  export const supportedChainIds = values(ChainId);

  /** Narrows a raw number (e.g. an API request's chainId) to a supported `ChainId`,
   * surfacing unsupported chains explicitly at the boundary. */
  export const isSupportedChainId = (value: number): value is ChainId => {
    return supportedChainIds.some((id) => id === value);
  };

  export const CHAIN_METADATA = {
    [ChainId.EthMainnet]: {
      name: "Ethereum",
      id: ChainId.EthMainnet,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      explorerUrl: "https://etherscan.io",
      identifier: "mainnet",
    },
    [ChainId.VNet]: {
      name: "VNet",
      id: ChainId.VNet,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      // No `explorerUrl`: the devnet is a self-hosted anvil mainnet fork with no block explorer.
      identifier: "vnet",
    },
    // [ChainId.BaseMainnet]: {
    //   name: "Base",
    //   id: ChainId.BaseMainnet,
    //   nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    //   explorerUrl: "https://basescan.org",
    //   identifier: "base",
    // },
  } satisfies Record<ChainId, ChainMetadata>;
}
