import type { Address } from "viem";
import type { ChainId } from "../../chain.js";
import type { RoundingDirection } from "../../math/MathLib.js";
import type { BigIntish } from "../../types.js";

import { NATIVE_ADDRESS } from "../../addresses.js";
import { ChainUtils } from "../../chain.js";
import { MathLib } from "../../math/MathLib.js";

/** Plain input shape for an ERC-20-like token. */
export interface IToken {
  address: Address;
  name?: string;
  symbol?: string;
  decimals?: BigIntish;
  price?: BigIntish;
}

/** Represents an ERC-20-like token and optional price metadata. */
export class Token implements IToken {
  static native(chainId: ChainId) {
    const currency = ChainUtils.CHAIN_METADATA[chainId].nativeCurrency;

    return new Token({ ...currency, address: NATIVE_ADDRESS });
  }

  /**
   * The token's address.
   */
  public readonly address: Address;

  /**
   * The token's name.
   */
  public readonly name?: string;

  /**
   * The token's symbol.
   */
  public readonly symbol?: string;

  /**
   * The token's number of decimals. Defaults to 0.
   */
  public readonly decimals: number;

  /**
   * Price of the token in USD (scaled by WAD).
   */
  public readonly price?: bigint;

  constructor({ address, name, symbol, decimals = 0, price }: IToken) {
    this.address = address;
    this.name = name;
    this.symbol = symbol;
    this.decimals = Number(decimals);

    if (price != null) this.price = BigInt(price);
  }

  /**
   * Quotes an amount in USD (scaled by WAD) in this token.
   * Returns `undefined` iff the token's price is undefined.
   * @param amount The amount of USD to quote.
   */
  fromUsd(amount: bigint, rounding: RoundingDirection = "Down") {
    if (this.price == null) return;

    return MathLib.mulDiv(amount, 10n ** BigInt(this.decimals), this.price, rounding);
  }

  /**
   * Quotes an amount of tokens in USD (scaled by WAD).
   * Returns `undefined` iff the token's price is undefined.
   * @param amount The amount of tokens to quote.
   */
  toUsd(amount: bigint, rounding: RoundingDirection = "Down") {
    if (this.price == null) return;

    return MathLib.mulDiv(amount, this.price, 10n ** BigInt(this.decimals), rounding);
  }
}
