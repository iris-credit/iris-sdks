import type { Client } from "viem";

import { describe, expect, test } from "vitest";
import { getChainAddresses } from "@iris-credit/core-sdk";
import { CHAIN_ID, ROGUE, USER_A } from "../../../../test/fixtures/iris.js";
import { UnsupportedAuthorizationOperatorError } from "../../../types/index.js";
import { encodeIrisSignatureAuthorization } from "./encodeIrisSignatureAuthorization.js";

const {
  bundler3: { generalAdapter1 },
} = getChainAddresses(CHAIN_ID);

const viemClient = { chain: { id: CHAIN_ID } } as unknown as Client;

describe("encodeIrisSignatureAuthorization", () => {
  test("default: encodes an authorization for the chain's GeneralAdapter1", () => {
    const requirement = encodeIrisSignatureAuthorization(viemClient, {
      owner: USER_A,
      authorized: generalAdapter1,
      chainId: CHAIN_ID,
    });

    expect(requirement.action.type).toBe("authorization");
    expect(requirement.action.args.authorized).toBe(generalAdapter1);
  });

  test("error: UnsupportedAuthorizationOperatorError when authorized is not GeneralAdapter1", () => {
    expect(() =>
      encodeIrisSignatureAuthorization(viemClient, {
        owner: USER_A,
        authorized: ROGUE,
        chainId: CHAIN_ID,
      }),
    ).toThrow(UnsupportedAuthorizationOperatorError);
  });

  test("error: UnsupportedAuthorizationOperatorError when revoking a non-registered operator", () => {
    expect(() =>
      encodeIrisSignatureAuthorization(viemClient, {
        owner: USER_A,
        authorized: ROGUE,
        chainId: CHAIN_ID,
        isAuthorized: false,
      }),
    ).toThrow(UnsupportedAuthorizationOperatorError);
  });
});
