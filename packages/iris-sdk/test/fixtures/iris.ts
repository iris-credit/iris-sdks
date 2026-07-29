import type { Address, Hex } from "viem";

import { ChainId } from "@iris-credit/core-sdk";

/** Chain every unit test targets; the only chain with a full address registry entry. @internal */
export const CHAIN_ID = ChainId.EthMainnet;

/** Chain id absent from the address registry, used to assert unsupported-chain failures. @internal */
export const UNSUPPORTED_CHAIN_ID = 4242 as ChainId;

/** @internal */
export const USER_A = "0x0000000000000000000000000000000000000001" as Address;
/** @internal */
export const USER_B = "0x0000000000000000000000000000000000000002" as Address;
/** @internal */
export const BORROWER = "0x0000000000000000000000000000000000000003" as Address;
/** @internal */
export const SOLVER = "0x0000000000000000000000000000000000000004" as Address;
/** @internal */
export const RECEIVER = "0x0000000000000000000000000000000000000005" as Address;
/** @internal */
export const BLM = "0x0000000000000000000000000000000000000006" as Address;
/** @internal */
export const COLLATERAL_TOKEN = "0x0000000000000000000000000000000000000007" as Address;
/** @internal */
export const DEBT_TOKEN = "0x0000000000000000000000000000000000000008" as Address;
/** @internal */
export const POD = "0x0000000000000000000000000000000000000009" as Address;
/** @internal */
export const ADAPTER = "0x000000000000000000000000000000000000000A" as Address;
/** @internal */
export const ERC4626 = "0x000000000000000000000000000000000000000b" as Address;
/** Address that is neither GeneralAdapter1 nor an approved spender. @internal */
export const ROGUE = "0x000000000000000000000000000000000000000C" as Address;

/** 65-byte ECDSA signature that `parseSignature` accepts (r, s, v = 0x1b). @internal */
export const SIGNATURE = `0x${"11".repeat(32)}${"22".repeat(32)}1b` as Hex;
