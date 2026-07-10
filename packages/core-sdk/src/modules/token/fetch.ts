import type { Address, CallParameters, Client, UnionPick } from "viem";
import type { ChainId } from "../../chain.js";

import { erc20Abi, erc20Abi_bytes32, hexToString, isHex } from "viem";
import { getChainId, readContract } from "viem/actions";
import { getChainAddresses, NATIVE_ADDRESS } from "../../addresses.js";
import { ChainUtils } from "../../chain.js";
import { ExchangeRateWrappedToken } from "./ExchangeRateWrappedToken.js";
import { Token } from "./Token.js";

/** Common viem call parameters accepted by core-sdk fetchers. */
export type FetchParameters = UnionPick<
  CallParameters,
  "account" | "blockNumber" | "blockTag" | "stateOverride"
> & {
  chainId?: ChainId;
};

/** Minimal wstETH abi covering the only read `fetchToken` performs. */
const wstEthAbi = [
  {
    inputs: [],
    name: "stEthPerToken",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Decodes ERC20 `bytes32` metadata results while leaving string metadata unchanged.
 *
 * @param hexOrStr - Metadata value returned by an ERC20 `name` or `symbol` read.
 * @returns The decoded string for hex input, or the original string for non-hex input.
 * @example
 * ```ts
 * import { decodeBytes32String } from "@iris-credit/core-sdk";
 *
 * const symbol = decodeBytes32String("0x5553444300000000000000000000000000000000000000000000000000000000");
 * ```
 */
export const decodeBytes32String = (hexOrStr: string) => {
  if (isHex(hexOrStr)) return hexToString(hexOrStr, { size: 32 });

  return hexOrStr;
};

/**
 * Fetches token metadata and wrapper metadata.
 *
 * Reads native token metadata locally for `NATIVE_ADDRESS`. For ERC20 tokens, reads `decimals`,
 * `symbol`, and `name` onchain, falling back to `bytes32` metadata reads. wstETH is returned as
 * an `ExchangeRateWrappedToken` unwrapping to stETH at the current `stEthPerToken` rate.
 *
 * @param address - Token address, or `NATIVE_ADDRESS` for the native asset.
 * @param client - Viem client used for the reads.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The hydrated `Token` or `ExchangeRateWrappedToken` entity.
 * @example
 * ```ts
 * import { fetchToken, type Token } from "@iris-credit/core-sdk";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
 *
 * const token: Token = await fetchToken(usdc, client);
 * ```
 */
export async function fetchToken(
  address: Address,
  client: Client,
  parameters: FetchParameters = {},
) {
  const chainId = parameters.chainId ?? (await getChainId(client));
  if (!ChainUtils.isSupportedChainId(chainId)) throw new Error(`unsupported chain id ${chainId}`);

  if (address === NATIVE_ADDRESS) return Token.native(chainId);

  const { wstETH, stETH } = getChainAddresses(chainId).tokens;

  const [decimals, symbol, name] = await Promise.all([
    readContract(client, {
      ...parameters,
      address,
      abi: erc20Abi,
      functionName: "decimals",
    }).catch(() => undefined),
    readContract(client, {
      ...parameters,
      address,
      abi: erc20Abi,
      functionName: "symbol",
    }).catch(() =>
      readContract(client, {
        ...parameters,
        address,
        abi: erc20Abi_bytes32,
        functionName: "symbol",
      })
        .then(decodeBytes32String)
        .catch(() => undefined),
    ),
    readContract(client, {
      ...parameters,
      address,
      abi: erc20Abi,
      functionName: "name",
    }).catch(() =>
      readContract(client, {
        ...parameters,
        address,
        abi: erc20Abi_bytes32,
        functionName: "name",
      })
        .then(decodeBytes32String)
        .catch(() => undefined),
    ),
  ]);

  const token = { address, name, symbol, decimals };

  if (address === wstETH) {
    const stEthPerWstEth = await readContract(client, {
      ...parameters,
      address: wstETH,
      abi: wstEthAbi,
      functionName: "stEthPerToken",
    });

    return new ExchangeRateWrappedToken(token, stETH, stEthPerWstEth);
  }

  return new Token(token);
}
