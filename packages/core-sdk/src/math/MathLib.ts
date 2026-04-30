import type { BigIntish } from "../types.js";

/** Rounding direction for share↔asset conversions. */
export type RoundingDirection = "Down" | "Up";

export namespace MathLib {
  export const WAD = 1_000000000000000000n;
  export const RAY = 1_000000000000000000000000000n;

  export const MAX_UINT_256 = maxUint(256);
  export const MAX_UINT_160 = maxUint(160);
  export const MAX_UINT_128 = maxUint(128);
  export const MAX_UINT_48 = maxUint(48);

  export function maxUint(nBits: number) {
    if (nBits % 4 !== 0) throw new Error(`Invalid number of bits: ${nBits}`);

    return BigInt(`0x${"f".repeat(nBits / 4)}`);
  }

  export function abs(a: BigIntish) {
    a = BigInt(a);

    return a >= 0 ? a : -a;
  }

  export function min(...xs: BigIntish[]) {
    return xs.map(BigInt).reduce((x, y) => (x <= y ? x : y));
  }

  export function max(...xs: BigIntish[]) {
    return xs.map(BigInt).reduce((x, y) => (x <= y ? y : x));
  }

  export function zeroFloorSub(x: BigIntish, y: BigIntish) {
    x = BigInt(x);
    y = BigInt(y);

    return x <= y ? 0n : x - y;
  }

  export function wMulDown(x: BigIntish, y: BigIntish) {
    return MathLib.wMul(x, y, "Down");
  }

  export function wMulUp(x: BigIntish, y: BigIntish) {
    return MathLib.wMul(x, y, "Up");
  }

  export function wMul(x: BigIntish, y: BigIntish, rounding: RoundingDirection) {
    return MathLib.mulDiv(x, y, MathLib.WAD, rounding);
  }

  export function wDivDown(x: BigIntish, y: BigIntish) {
    return MathLib.wDiv(x, y, "Down");
  }

  export function wDivUp(x: BigIntish, y: BigIntish) {
    return MathLib.wDiv(x, y, "Up");
  }

  export function wDiv(x: BigIntish, y: BigIntish, rounding: RoundingDirection) {
    return MathLib.mulDiv(x, MathLib.WAD, y, rounding);
  }

  export function mulDivDown(x: BigIntish, y: BigIntish, denominator: BigIntish) {
    x = BigInt(x);
    y = BigInt(y);
    denominator = BigInt(denominator);
    if (denominator === 0n) throw Error("MathLib: DIVISION_BY_ZERO");

    return (x * y) / denominator;
  }

  export function mulDivUp(x: BigIntish, y: BigIntish, denominator: BigIntish) {
    x = BigInt(x);
    y = BigInt(y);
    denominator = BigInt(denominator);
    if (denominator === 0n) throw Error("MathLib: DIVISION_BY_ZERO");

    const roundup = (x * y) % denominator > 0 ? 1n : 0n;

    return (x * y) / denominator + roundup;
  }

  export function mulDiv(
    x: BigIntish,
    y: BigIntish,
    denominator: BigIntish,
    rounding: RoundingDirection,
  ) {
    return MathLib[`mulDiv${rounding}`](x, y, denominator);
  }

  export function wToRay(x: BigIntish) {
    return BigInt(x) * 1_000000000n;
  }
}
