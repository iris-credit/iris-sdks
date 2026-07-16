import { bytesToBigInt } from "viem";

/** Random uint256 nonce for Quote/Authorization. Iris marks nonces used per signer, so uniqueness suffices — no on-chain read needed. */
export const randomNonce = (): bigint => bytesToBigInt(crypto.getRandomValues(new Uint8Array(32)));
