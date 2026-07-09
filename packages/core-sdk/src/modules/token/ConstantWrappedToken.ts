import type { Address } from "viem";
import type { RoundingDirection } from "../../math/MathLib.js";
import type { IToken } from "./Token.js";

import { MathLib } from "../../math/MathLib.js";
import { BigIntish } from "../../types.js";
import { WrappedToken } from "./WrappedToken.js";

export class ConstantWrappedToken extends WrappedToken {
  public readonly underlyingDecimals;

  constructor(token: IToken, underlying: Address, underlyingDecimals: BigIntish = 0) {
    super(token, underlying);

    this.underlyingDecimals = BigInt(underlyingDecimals);
  }

  public override toWrappedExactAmountIn(
    unwrappedAmount: bigint,
    _slippage?: bigint,
    rounding: RoundingDirection = "Down",
  ) {
    return super.toWrappedExactAmountIn(unwrappedAmount, 0n, rounding);
  }

  /** The amount of unwrappedTokens that should be wrapped to receive `wrappedAmount` */
  public override toWrappedExactAmountOut(
    wrappedAmount: bigint,
    _slippage?: bigint,
    rounding: RoundingDirection = "Up",
  ) {
    return super.toWrappedExactAmountOut(wrappedAmount, 0n, rounding);
  }

  /** The expected amount when unwrapping `wrappedAmount` */
  public override toUnwrappedExactAmountIn(
    wrappedAmount: bigint,
    _slippage?: bigint,
    rounding: RoundingDirection = "Down",
  ) {
    return super.toUnwrappedExactAmountIn(wrappedAmount, 0n, rounding);
  }

  /** The amount of wrappedTokens that should be unwrapped to receive `unwrappedAmount` */
  public override toUnwrappedExactAmountOut(
    unwrappedAmount: bigint,
    _slippage?: bigint,
    rounding: RoundingDirection = "Up",
  ) {
    return super.toUnwrappedExactAmountOut(unwrappedAmount, 0n, rounding);
  }

  protected override _wrap(amount: bigint) {
    return MathLib.mulDivDown(amount, 10n ** BigInt(this.decimals), 10n ** this.underlyingDecimals);
  }

  protected override _unwrap(amount: bigint) {
    return MathLib.mulDivDown(amount, 10n ** this.underlyingDecimals, 10n ** BigInt(this.decimals));
  }
}
