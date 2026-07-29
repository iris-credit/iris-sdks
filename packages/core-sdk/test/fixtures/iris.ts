import type { Address, Hex } from "viem";

/** @internal */
export const USER = "0x0000000000000000000000000000000000000001" as Address;
/** @internal */
export const SOLVER = "0x0000000000000000000000000000000000000002" as Address;
/** @internal */
export const COLLATERAL_TOKEN = "0x0000000000000000000000000000000000000003" as Address;
/** @internal */
export const DEBT_TOKEN = "0x0000000000000000000000000000000000000004" as Address;
/** @internal */
export const POD = "0x0000000000000000000000000000000000000005" as Address;
/** @internal */
export const BLM = "0x0000000000000000000000000000000000000006" as Address;
/** @internal */
export const RECIPIENT = "0x0000000000000000000000000000000000000007" as Address;
/** @internal */
export const SPENDER = "0x0000000000000000000000000000000000000008" as Address;
/** @internal */
export const EMPTY_HEX = "0x" as Hex;

/** @internal */
export const MATURITY = 2_000_000n;
/** @internal */
export const OVERDUE_PERIOD = 3_600n;
