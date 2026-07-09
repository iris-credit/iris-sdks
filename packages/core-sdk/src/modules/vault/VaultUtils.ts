import type { RoundingDirection } from "../../math/MathLib.js";
import type { BigIntish } from "../../types.js";

import { MathLib } from "../../math/MathLib.js";

export namespace VaultUtils {
  /** Virtual assets added to ERC-4626 total assets in conversion formulas. */
  export const VIRTUAL_ASSETS = 1n;

  /**
   * Returns the decimals offset between 18-decimal vault shares and an asset.
   *
   * @param underlyingDecimals - The asset decimals.
   * @param decimals - The vault share decimals. Defaults to `18n`.
   * @returns The non-negative decimals offset.
   */
  export const decimalsOffset = (underlyingDecimals: BigIntish, decimals: BigIntish = 18n) => {
    return MathLib.zeroFloorSub(decimals, underlyingDecimals);
  };

  /**
   * Converts vault shares to underlying assets.
   *
   * @param shares - The amount of vault shares.
   * @param vault.totalAssets - The vault's total assets.
   * @param vault.totalSupply - The vault's total share supply.
   * @param vault.decimalsOffset - The vault's decimals offset.
   * @param rounding - Optional rounding direction. Defaults to `"Down"`.
   * @returns The equivalent amount of underlying assets.
   */
  export const toAssets = (
    shares: BigIntish,
    {
      totalAssets,
      totalSupply,
      decimalsOffset,
    }: {
      totalAssets: BigIntish;
      totalSupply: BigIntish;
      decimalsOffset: BigIntish;
    },
    rounding: RoundingDirection = "Down",
  ) => {
    return MathLib.mulDiv(
      shares,
      BigInt(totalAssets) + VIRTUAL_ASSETS,
      BigInt(totalSupply) + 10n ** BigInt(decimalsOffset),
      rounding,
    );
  };

  /**
   * Converts underlying assets to vault shares.
   *
   * @param assets - The amount of underlying assets.
   * @param vault.totalAssets - The vault's total assets.
   * @param vault.totalSupply - The vault's total share supply.
   * @param vault.decimalsOffset - The vault's decimals offset.
   * @param rounding - Optional rounding direction. Defaults to `"Up"`.
   * @returns The equivalent amount of vault shares.
   */
  export const toShares = (
    assets: BigIntish,
    {
      totalAssets,
      totalSupply,
      decimalsOffset,
    }: {
      totalAssets: BigIntish;
      totalSupply: BigIntish;
      decimalsOffset: BigIntish;
    },
    rounding: RoundingDirection = "Up",
  ) => {
    return MathLib.mulDiv(
      assets,
      BigInt(totalSupply) + 10n ** BigInt(decimalsOffset),
      BigInt(totalAssets) + VIRTUAL_ASSETS,
      rounding,
    );
  };
}
