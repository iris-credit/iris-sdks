import type { Address, Client } from "viem";
import type { FetchParameters } from "../../types.js";

import { erc20Abi, erc20Abi_bytes32, getAddress, hexToString, isHex } from "viem";
import { getChainId, readContract } from "viem/actions";
import { getChainAddresses, getUnwrappedToken, NATIVE_ADDRESS } from "../../addresses.js";
import { ChainUtils } from "../../chain.js";
import { UnsupportedChainIdError } from "../../errors.js";
import { ConstantWrappedToken } from "./ConstantWrappedToken.js";
import { ExchangeRateWrappedToken } from "./ExchangeRateWrappedToken.js";
import { Token } from "./Token.js";

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
 * `symbol`, and `name` (string and `bytes32` variants) concurrently, mapping individually failed
 * reads to `undefined`. wstETH is returned as an `ExchangeRateWrappedToken` unwrapping to stETH
 * at the current `stEthPerToken` rate, and tokens with a registered unwrapped token (see
 * `getUnwrappedToken`) as `ConstantWrappedToken`s.
 *
 * @param address - Token address in any casing, or `NATIVE_ADDRESS` for the native asset.
 * @param client - Viem client used for the reads.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The hydrated `Token`, `ConstantWrappedToken`, or `ExchangeRateWrappedToken` entity.
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
  if (!ChainUtils.isSupportedChainId(chainId)) throw new UnsupportedChainIdError(chainId);

  // Normalize casing upfront so the strict comparisons and mapping lookups below are reliable.
  address = getAddress(address);

  if (address === NATIVE_ADDRESS) return Token.native(chainId);

  const { tokens } = getChainAddresses(chainId);
  const { wstETH, stETH } = tokens;

  const erc20 = { ...parameters, address, abi: erc20Abi } as const;
  const erc20_bytes32 = { ...parameters, address, abi: erc20Abi_bytes32 } as const;

  // Over-fetches both abi variants concurrently: reads cost nothing extra onchain, and it avoids
  // a second round trip for `bytes32`-metadata tokens (e.g. MKR).
  const [decimals, symbol, symbol32, name, name32] = await Promise.all([
    readContract(client, { ...erc20, functionName: "decimals" }).catch(() => undefined),
    readContract(client, { ...erc20, functionName: "symbol" }).catch(() => undefined),
    readContract(client, { ...erc20_bytes32, functionName: "symbol" }).catch(() => undefined),
    readContract(client, { ...erc20, functionName: "name" }).catch(() => undefined),
    readContract(client, { ...erc20_bytes32, functionName: "name" }).catch(() => undefined),
  ]);

  const token = {
    address,
    decimals,
    symbol: symbol ?? (symbol32 != null ? decodeBytes32String(symbol32) : undefined),
    name: name ?? (name32 != null ? decodeBytes32String(name32) : undefined),
  };

  switch (address) {
    case wstETH: {
      const stEthPerWstEth = await readContract(client, {
        ...parameters,
        address: wstETH,
        abi: wstEthAbi,
        functionName: "stEthPerToken",
      });

      return new ExchangeRateWrappedToken(token, stETH, stEthPerWstEth);
    }
  }

  const unwrapToken = getUnwrappedToken(address, chainId);
  if (unwrapToken) return new ConstantWrappedToken(token, unwrapToken, token.decimals);

  return new Token(token);
}
