import type { Client } from "viem";

import { Iris } from "../entities/iris.js";
import { IrisClientType } from "../types/index.js";

function createIrisNamespace(viemClient: Client): IrisClientType {
  const namespace: IrisClientType = {
    viemClient,

    iris() {
      return new Iris();
    },
  };

  return namespace;
}

export function irisViemExtension() {
  return <TClient extends Client>(client: TClient) => {
    return {
      iris: createIrisNamespace(client),
    };
  };
}
