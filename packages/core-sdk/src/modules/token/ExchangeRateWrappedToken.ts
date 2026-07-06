import type { Address } from "viem";
import type { RoundingDirection } from "../../math/MathLib.js";
import type { IToken } from "./Token.js";

import { MathLib } from "../../math/MathLib.js";
import { WrappedToken } from "./WrappedToken.js";

/** Represents a wrapped token whose conversion uses a WAD-scaled exchange rate. */
export class ExchangeRateWrappedToken extends WrappedToken {
  constructor(
    token: IToken,
    readonly underlying: Address,
    public wrappedTokenExchangeRate: bigint,
  ) {
    super(token, underlying);
  }

  protected override _wrap(amount: bigint, rounding: RoundingDirection) {
    return MathLib.wDiv(amount, this.wrappedTokenExchangeRate, rounding);
  }

  protected override _unwrap(amount: bigint, rounding: RoundingDirection) {
    return MathLib.wMul(amount, this.wrappedTokenExchangeRate, rounding);
  }
}
