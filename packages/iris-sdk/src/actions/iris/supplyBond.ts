import type { Address } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type {
  DepositAmountArgs,
  IrisSupplyBondAction,
  PermitRequirementSignature,
  Transaction,
} from "../../types/index.js";

import { deepFreeze } from "@iris-credit/iris-ts";
import { BundlerAction } from "../../bundler/actions.js";
import { NegativeInputError, NonPositiveInputError } from "../../types/index.js";
import { buildAssetFundingActions } from "./buildAssetFundingActions.js";

/** Parameters for {@link irisSupplyBond}. */
export interface IrisSupplyBondParams {
  /** The chain the bundle targets. */
  readonly chainId: ChainId;
  readonly args: DepositAmountArgs & {
    /** Pod identifying the loan whose bond is topped up. */
    readonly pod: Address;
    /** The loan's debt token — the asset the bond is denominated in. */
    readonly token: Address;
    /** Optional pre-signed permit/permit2 approval for the ERC-20 bond transfer. */
    readonly requirementSignature?: PermitRequirementSignature;
  };
}

/**
 * Prepares a supply-bond transaction topping up an Iris loan's solver bond.
 *
 * Routed through bundler3: `buildAssetFundingActions` moves the bond into `GeneralAdapter1`, then
 * `irisSupplyBond` supplies `amount + nativeAmount` — the exact funded total rather than the
 * `maxUint256` sweep the adapter also accepts, so a balance this bundle did not fund is never
 * pulled into the loan. `Iris.supplyBond` is permissionless, so anyone may top the bond up on the
 * solver's behalf and no Iris authorization is folded in.
 *
 * @param params.chainId - The chain the bundle targets.
 * @param params.args.pod - Pod identifying the loan whose bond is credited.
 * @param params.args.token - The loan's debt token.
 * @param params.args.amount - ERC-20 bond to pull from the payer. At least one of `amount` or
 *   `nativeAmount` must be positive. Defaults to `0n`.
 * @param params.args.nativeAmount - Optional bond paid in the native token and wrapped in-bundle;
 *   the debt token must be the chain's wNative.
 * @param params.args.requirementSignature - Optional pre-signed permit/permit2 approval.
 * @returns A deep-frozen `Transaction<IrisSupplyBondAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator.
 * @throws {NegativeInputError} when `amount` or `nativeAmount` is negative.
 * @throws {NonPositiveInputError} when `amount` and `nativeAmount` both resolve to zero.
 * @throws {NativeAmountOnNonWNativeAssetError} from `buildAssetFundingActions` when
 *   `nativeAmount > 0n` but `token` is not the chain's wNative.
 * @throws {DepositAssetMismatchError} from `getTokenRequirementActions` when `requirementSignature`
 *   is provided and the signed asset differs from `token`.
 * @throws {DepositAmountMismatchError} from `getTokenRequirementActions` when `requirementSignature`
 *   is provided and the signed amount differs from `amount`.
 * @example
 * ```ts
 * import { irisSupplyBond } from "@iris-credit/iris-sdk";
 *
 * const tx = irisSupplyBond({
 *   chainId: 1,
 *   args: {
 *     pod, // the loan's pod
 *     token: debtToken, // the loan's debt token
 *     amount: 1_000_000n,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<IrisSupplyBondAction>>
 * ```
 */
export const irisSupplyBond = ({
  chainId,
  args: { pod, token, amount = 0n, nativeAmount, requirementSignature },
}: IrisSupplyBondParams): Readonly<Transaction<IrisSupplyBondAction>> => {
  if (amount < 0n) throw new NegativeInputError("amount", amount);
  if (nativeAmount !== undefined && nativeAmount < 0n) {
    throw new NegativeInputError("nativeAmount", nativeAmount);
  }

  const totalBond = amount + (nativeAmount ?? 0n);

  if (totalBond === 0n) throw new NonPositiveInputError("totalBond", totalBond);

  const actions = buildAssetFundingActions({
    chainId,
    asset: token,
    erc20Amount: amount,
    nativeAmount: nativeAmount ?? 0n,
    requirementSignature,
  });

  actions.push({
    type: "irisSupplyBond",
    args: [pod, token, totalBond, false /* skipRevert */],
  });

  const tx = BundlerAction.encodeBundle(chainId, actions);

  return deepFreeze({
    ...tx,
    action: {
      type: "irisSupplyBond",
      args: { pod, token, amount: totalBond, nativeAmount },
    },
  });
};
