import type { Client } from "viem";

import { IrisActions } from "../actions/index.js";

export interface IrisClientType {
  readonly viemClient: Client;

  iris: () => IrisActions;
}
