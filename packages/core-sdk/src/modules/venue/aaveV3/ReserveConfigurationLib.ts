import type { BigIntish } from "../../../types.js";

/**
 * Namespace of decoders for the reserve's packed `ReserveConfigurationMap.data` word,
 * mirroring Aave V3's `ReserveConfiguration` library.
 */
export namespace ReserveConfigurationLib {
  /**
   * Returns the reserve's max loan-to-value from its packed configuration word (in basis
   * points), matching Aave's `ReserveConfiguration.getLtv` (bits 0-15).
   *
   * @param configuration The reserve's `ReserveConfigurationMap.data` word.
   * @returns The reserve's max LTV (in basis points).
   * @example
   * ```ts
   * import { ReserveConfigurationLib } from "@iris-credit/core-sdk";
   *
   * const ltv = ReserveConfigurationLib.getLtv(0x1f40n);
   * // ltv === 8000n (80%)
   * ```
   */
  export const getLtv = (configuration: BigIntish) => BigInt(configuration) & 0xffffn;

  /**
   * Returns the reserve asset's decimals from its packed configuration word, matching
   * Aave's `ReserveConfiguration.getDecimals` (bits 48-55).
   *
   * @param configuration The reserve's `ReserveConfigurationMap.data` word.
   * @returns The reserve asset's decimals.
   * @example
   * ```ts
   * import { ReserveConfigurationLib } from "@iris-credit/core-sdk";
   *
   * const decimals = ReserveConfigurationLib.getDecimals(6n << 48n);
   * // decimals === 6n
   * ```
   */
  export const getDecimals = (configuration: BigIntish) => (BigInt(configuration) >> 48n) & 0xffn;

  /**
   * Returns the reserve's state flags from its packed configuration word, matching Aave's
   * `ReserveConfiguration.getFlags` (bits 56-58 and 60).
   *
   * @param configuration The reserve's `ReserveConfigurationMap.data` word.
   * @returns The reserve's active, frozen, borrowing-enabled and paused flags.
   * @example
   * ```ts
   * import { ReserveConfigurationLib } from "@iris-credit/core-sdk";
   *
   * const flags = ReserveConfigurationLib.getFlags((1n << 56n) | (1n << 58n));
   * // flags === { isActive: true, isFrozen: false, borrowingEnabled: true, isPaused: false }
   * ```
   */
  export const getFlags = (configuration: BigIntish) => {
    configuration = BigInt(configuration);

    return {
      isActive: (configuration & (1n << 56n)) !== 0n,
      isFrozen: (configuration & (1n << 57n)) !== 0n,
      borrowingEnabled: (configuration & (1n << 58n)) !== 0n,
      isPaused: (configuration & (1n << 60n)) !== 0n,
    };
  };

  /**
   * Returns the reserve's factor from its packed configuration word (in basis points),
   * matching Aave's `ReserveConfiguration.getReserveFactor` (bits 64-79).
   *
   * @param configuration The reserve's `ReserveConfigurationMap.data` word.
   * @returns The reserve factor (in basis points).
   * @example
   * ```ts
   * import { ReserveConfigurationLib } from "@iris-credit/core-sdk";
   *
   * const reserveFactor = ReserveConfigurationLib.getReserveFactor(1_500n << 64n);
   * // reserveFactor === 1500n (15%)
   * ```
   */
  export const getReserveFactor = (configuration: BigIntish) =>
    (BigInt(configuration) >> 64n) & 0xffffn;

  /**
   * Returns the reserve's borrow cap from its packed configuration word (in whole tokens,
   * 0 meaning no cap), matching Aave's `ReserveConfiguration.getBorrowCap` (bits 80-115).
   *
   * @param configuration The reserve's `ReserveConfigurationMap.data` word.
   * @returns The borrow cap (in whole tokens).
   * @example
   * ```ts
   * import { ReserveConfigurationLib } from "@iris-credit/core-sdk";
   *
   * const borrowCap = ReserveConfigurationLib.getBorrowCap(1_000_000n << 80n);
   * // borrowCap === 1000000n
   * ```
   */
  export const getBorrowCap = (configuration: BigIntish) =>
    (BigInt(configuration) >> 80n) & 0xfffffffffn;

  /**
   * Returns the reserve's supply cap from its packed configuration word (in whole tokens,
   * 0 meaning no cap), matching Aave's `ReserveConfiguration.getSupplyCap` (bits 116-151).
   *
   * @param configuration The reserve's `ReserveConfigurationMap.data` word.
   * @returns The supply cap (in whole tokens).
   * @example
   * ```ts
   * import { ReserveConfigurationLib } from "@iris-credit/core-sdk";
   *
   * const supplyCap = ReserveConfigurationLib.getSupplyCap(1_000_000n << 116n);
   * // supplyCap === 1000000n
   * ```
   */
  export const getSupplyCap = (configuration: BigIntish) =>
    (BigInt(configuration) >> 116n) & 0xfffffffffn;
}
