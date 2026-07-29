import { describe, expect, test } from "vitest";
import { getChainAddresses } from "@iris-credit/core-sdk";
import { CHAIN_ID, ROGUE, SIGNATURE, USER_A } from "../../../test/fixtures/iris.js";
import { authorizationSignature } from "../../../test/helpers/iris.js";
import { BundlerErrors } from "../../types/index.js";
import { getIrisAuthorizationAction } from "./getIrisAuthorizationAction.js";

const {
  bundler3: { generalAdapter1 },
} = getChainAddresses(CHAIN_ID);

describe("getIrisAuthorizationAction", () => {
  test("default", () => {
    const action = getIrisAuthorizationAction(CHAIN_ID, authorizationSignature());

    expect(action.type).toBe("irisSetAuthorizationWithSig");
    expect(action.args).toEqual([
      {
        authorizer: USER_A,
        authorized: generalAdapter1,
        isAuthorized: true,
        nonce: 7n,
        deadline: 1_900_000_000n,
      },
      SIGNATURE,
      false,
    ]);
  });

  test("behavior: maps owner to authorizer and forwards the raw signature", () => {
    const action = getIrisAuthorizationAction(CHAIN_ID, authorizationSignature());
    if (action.type !== "irisSetAuthorizationWithSig") {
      throw new Error("expected an irisSetAuthorizationWithSig action");
    }
    const [authorization, signature] = action.args;

    // The bundler `Authorization` struct carries `authorizer`, not `owner`.
    expect(authorization).not.toHaveProperty("owner");
    expect(authorization.authorizer).toBe(USER_A);
    expect(signature).toBe(SIGNATURE);
  });

  test("error: UnexpectedSignature when authorized is not GeneralAdapter1", () => {
    expect(() =>
      getIrisAuthorizationAction(CHAIN_ID, authorizationSignature({ authorized: ROGUE })),
    ).toThrow(BundlerErrors.UnexpectedSignature);
  });
});
