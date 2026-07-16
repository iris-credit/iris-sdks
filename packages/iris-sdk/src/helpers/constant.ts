import type { Address } from "viem";

import { maxUint96 } from "viem";
import { ChainId } from "@iris-credit/core-sdk";

/**
 * Tokens that require setting allowance from zero before changing approval.
 */
export const APPROVE_ONLY_ONCE_TOKENS: Partial<Record<number, Address[]>> = {
  [ChainId.EthMainnet]: [
    "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
    "0xD533a949740bb3306d119CC777fa900bA034cd52", // CRV
  ],
};

/**
 * Token-specific maximum approval amounts for tokens that cannot use uint256 max.
 */
export const MAX_TOKEN_APPROVALS: Partial<Record<number, Record<Address, bigint>>> = {
  [ChainId.EthMainnet]: {
    "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984": maxUint96, // UNI
    "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3": maxUint96, // ONDO
    "0xc00e94Cb662C3520282E6f5717214004A7f26888": maxUint96, // COMP
    "0x6f40d4A6237C257fff2dB00FA0510DeEECd303eb": maxUint96, // FLUID
  },
};
