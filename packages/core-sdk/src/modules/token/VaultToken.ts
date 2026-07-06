import type { Address } from "viem";
import type { RoundingDirection } from "../../math/MathLib.js";
import type { BigIntish } from "../../types.js";
import type { IToken } from "./Token.js";

import { VaultUtils } from "../vault/VaultUtils.js";
import { WrappedToken } from "./WrappedToken.js";

/** Plain input shape for ERC-4626-like vault token totals. */
export interface IVaultToken {
  totalAssets: bigint;
  totalSupply: bigint;
}

/** Plain input shape for immutable MetaMorpho vault token configuration. */
export interface IVaultConfig extends Omit<IToken, "decimals"> {
  decimalsOffset: BigIntish;
  asset: Address;
}

/** Represents an ERC-4626-like vault token with share and asset conversion math. */
export class VaultToken extends WrappedToken implements IVaultToken {
  public readonly asset: Address;
  public readonly decimalsOffset: bigint;

  /**
   * The ERC4626 vault's total supply of shares.
   */
  public totalSupply: bigint;

  /**
   * The ERC4626 vault's total assets.
   */
  public totalAssets: bigint;

  constructor(config: IVaultConfig, { totalAssets, totalSupply }: IVaultToken) {
    super(config, config.asset);

    this.asset = config.asset;

    this.totalAssets = totalAssets;
    this.totalSupply = totalSupply;
    this.decimalsOffset = BigInt(config.decimalsOffset);
  }

  protected override _wrap(amount: BigIntish, rounding?: RoundingDirection) {
    return VaultUtils.toShares(amount, this, rounding);
  }

  protected override _unwrap(amount: BigIntish, rounding?: RoundingDirection) {
    return VaultUtils.toAssets(amount, this, rounding);
  }

  public toAssets(shares: bigint, rounding?: RoundingDirection) {
    return this._unwrap(shares, rounding);
  }

  public toShares(assets: bigint, rounding?: RoundingDirection) {
    return this._wrap(assets, rounding);
  }
}
