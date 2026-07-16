import type { Client } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type { IrisActions } from "../actions/index.js";

/** The stateless `iris` namespace exposed on an extended viem client. */
export interface IrisClientType {
  readonly viemClient: Client;

  readonly options: {
    /** Whether the integrator can collect EIP-712 signatures for Permit2. Defaults to `false`. */
    readonly supportSignature: boolean;
  };

  iris: (chainId: ChainId) => IrisActions;
}
