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
  readonly explorerUrl: string;
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

  export const getExplorerUrl = (chainId: ChainId) => {
    return ChainUtils.CHAIN_METADATA[chainId].explorerUrl;
  };

  export const getExplorerAddressUrl = (chainId: ChainId, address: string) => {
    return `${getExplorerUrl(chainId)}/address/${address}`;
  };

  export const getExplorerTransactionUrl = (chainId: ChainId, tx: string) => {
    return `${getExplorerUrl(chainId)}/tx/${tx}`;
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
      // Explorer root, so `/tx/<hash>` resolves; the vnet explorer has no address route.
      explorerUrl:
        "https://dashboard.tenderly.co/explorer/vnet/1d48b36f-5ce7-4b0d-b742-1a279b04aebf",
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
