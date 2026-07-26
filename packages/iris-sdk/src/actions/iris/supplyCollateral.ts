import type { Address } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type {
  DepositAmountArgs,
  IrisSupplyCollateralAction,
  PermitRequirementSignature,
  Transaction,
} from "../../types/index.js";

import { deepFreeze } from "@iris-credit/iris-ts";
import { BundlerAction } from "../../bundler/actions.js";
import { NegativeInputError, NonPositiveInputError } from "../../types/index.js";
import { buildAssetFundingActions } from "./buildAssetFundingActions.js";

/** Parameters for {@link irisSupplyCollateral}. */
export interface IrisSupplyCollateralParams {
  /** The chain the bundle targets. */
  readonly chainId: ChainId;
  readonly args: DepositAmountArgs & {
    /** Pod identifying the loan whose collateral position is credited. */
    readonly pod: Address;
    /** The loan's collateral token — the asset funded into the adapter and supplied. */
    readonly token: Address;
    /** Optional pre-signed permit/permit2 approval for the ERC-20 collateral transfer. */
    readonly requirementSignature?: PermitRequirementSignature;
  };
}

/**
 * Prepares a supply-collateral transaction topping up an Iris loan's collateral.
 *
 * Routed through bundler3: `buildAssetFundingActions` moves the collateral into `GeneralAdapter1`,
 * then `irisSupplyCollateral` supplies `amount + nativeAmount` — the exact funded total rather than
 * the `maxUint256` sweep the adapter also accepts, so a balance this bundle did not fund is never
 * pulled into the loan. `Iris.supplyCollateral` is permissionless, so no Iris authorization is
 * folded in.
 *
 * @param params.chainId - The chain the bundle targets.
 * @param params.args.pod - Pod identifying the loan to credit.
 * @param params.args.token - The loan's collateral token.
 * @param params.args.amount - ERC-20 collateral to pull from the payer. At least one of `amount`
 *   or `nativeAmount` must be positive. Defaults to `0n`.
 * @param params.args.nativeAmount - Optional collateral paid in the native token and wrapped
 *   in-bundle; the collateral token must be the chain's wNative.
 * @param params.args.requirementSignature - Optional pre-signed permit/permit2 approval.
 * @returns A deep-frozen `Transaction<IrisSupplyCollateralAction>` with `to`, `value`, `data`, and
 *   the typed `action` discriminator.
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
 * import { irisSupplyCollateral } from "@iris-credit/iris-sdk";
 *
 * const tx = irisSupplyCollateral({
 *   chainId: 1,
 *   args: {
 *     pod, // the loan's pod
 *     token: collateralToken, // the loan's collateral token
 *     amount: 1_000_000_000_000_000_000n,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<IrisSupplyCollateralAction>>
 * ```
 */
export const irisSupplyCollateral = ({
  chainId,
  args: { pod, token, amount = 0n, nativeAmount, requirementSignature },
}: IrisSupplyCollateralParams): Readonly<Transaction<IrisSupplyCollateralAction>> => {
  if (amount < 0n) throw new NegativeInputError("amount", amount);
  if (nativeAmount !== undefined && nativeAmount < 0n) {
    throw new NegativeInputError("nativeAmount", nativeAmount);
  }

  const totalCollateral = amount + (nativeAmount ?? 0n);

  if (totalCollateral === 0n) {
    throw new NonPositiveInputError("totalCollateral", totalCollateral);
  }

  const actions = buildAssetFundingActions({
    chainId,
    asset: token,
    erc20Amount: amount,
    nativeAmount: nativeAmount ?? 0n,
    requirementSignature,
  });

  actions.push({
    type: "irisSupplyCollateral",
    args: [pod, token, totalCollateral, false /* skipRevert */],
  });

  const tx = BundlerAction.encodeBundle(chainId, actions);

  return deepFreeze({
    ...tx,
    action: {
      type: "irisSupplyCollateral",
      args: { pod, token, amount: totalCollateral, nativeAmount },
    },
  });
};
