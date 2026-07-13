import type { Address, Client } from "viem";
import type { FetchParameters } from "../../types.js";

import { erc20Abi, getAddress, maxUint256 } from "viem";
import { getBalance, getChainId, readContract } from "viem/actions";
import { fromEntries, getValue } from "@iris-credit/iris-ts";
import { permit2Abi } from "../../abis/permit2.js";
import { getChainAddresses, NATIVE_ADDRESS } from "../../addresses.js";
import { ChainUtils } from "../../chain.js";
import { UnsupportedChainIdError } from "../../errors.js";
import { ERC20_ALLOWANCE_RECIPIENTS, Holding } from "./Holding.js";

/**
 * Fetches a user's balance and Iris-related allowances for one token.
 *
 * Native holdings use `eth_getBalance`, unlimited ERC20 allowance placeholders, and zero Permit2
 * allowances. ERC20 holdings read the balance, direct allowances, and available Permit2
 * allowances concurrently. The bundler allowance is zero when no general adapter is configured
 * for the chain.
 *
 * @param user - Address whose holding is fetched.
 * @param token - Token address, or `NATIVE_ADDRESS` for the native asset.
 * @param client - Viem client used for the reads.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override for ERC20 reads; native balance
 * reads use `eth_getBalance` and cannot apply it.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The hydrated `Holding` entity.
 */
export async function fetchHolding(
  user: Address,
  token: Address,
  client: Client,
  parameters: FetchParameters = {},
) {
  const chainId = parameters.chainId ?? (await getChainId(client));
  if (!ChainUtils.isSupportedChainId(chainId)) throw new UnsupportedChainIdError(chainId);

  user = getAddress(user);
  token = getAddress(token);

  if (token === NATIVE_ADDRESS)
    return new Holding({
      user,
      token,
      erc20Allowances: fromEntries(ERC20_ALLOWANCE_RECIPIENTS.map((label) => [label, maxUint256])),
      permit2IrisAllowance: {
        amount: 0n,
        expiration: 0n,
        nonce: 0n,
      },
      permit2BundlerAllowance: {
        amount: 0n,
        expiration: 0n,
        nonce: 0n,
      },
      balance: await getBalance(client, {
        address: user,
        ...parameters,
      }),
    });

  const chainAddresses = getChainAddresses(chainId);

  const [balance, erc20Allowances, permit2IrisAllowance, permit2BundlerAllowance] =
    await Promise.all([
      readContract(client, {
        ...parameters,
        abi: erc20Abi,
        address: token,
        functionName: "balanceOf",
        args: [user],
      }),
      Promise.all(
        ERC20_ALLOWANCE_RECIPIENTS.map(async (label) => {
          const spender = getValue(chainAddresses, label);
          if (spender == null) return [label, 0n] as const;

          return [
            label,
            await readContract(client, {
              ...parameters,
              abi: erc20Abi,
              address: token,
              functionName: "allowance",
              args: [user, spender],
            }),
          ] as const;
        }),
      ),
      readContract(client, {
        ...parameters,
        abi: permit2Abi,
        address: chainAddresses.permit2,
        functionName: "allowance",
        args: [user, token, chainAddresses.iris],
      }).then(([amount, expiration, nonce]) => ({
        amount,
        expiration: BigInt(expiration),
        nonce: BigInt(nonce),
      })),
      readContract(client, {
        ...parameters,
        abi: permit2Abi,
        address: chainAddresses.permit2,
        functionName: "allowance",
        args: [user, token, chainAddresses.bundler3.generalAdapter1],
      }).then(([amount, expiration, nonce]) => ({
        amount,
        expiration: BigInt(expiration),
        nonce: BigInt(nonce),
      })),
    ]);

  return new Holding({
    user,
    token,
    erc20Allowances: fromEntries(erc20Allowances),
    permit2IrisAllowance,
    permit2BundlerAllowance,
    balance,
  });
}
