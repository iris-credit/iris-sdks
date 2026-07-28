import type { Client } from "viem";

import { decodeFunctionData } from "viem";
import { describe, expect, test, vi } from "vitest";
import { getChainAddresses, irisAbi } from "@iris-credit/core-sdk";
import { CHAIN_ID, USER_A } from "../../../../test/fixtures/iris.js";
import { ChainIdMismatchError, isRequirementSignature } from "../../../types/index.js";
import { getIrisAuthorizationRequirement } from "./getIrisAuthorizationRequirement.js";

const {
  iris,
  bundler3: { generalAdapter1 },
} = getChainAddresses(CHAIN_ID);

function makeClient({ chainId, isAuthorized }: { chainId: number; isAuthorized: boolean }): Client {
  return {
    chain: { id: chainId },
    extend: () => ({
      readContract: vi.fn(() => Promise.resolve(isAuthorized)),
    }),
  } as unknown as Client;
}

describe("getIrisAuthorizationRequirement", () => {
  test("throws ChainIdMismatchError when the client chain differs", async () => {
    await expect(
      getIrisAuthorizationRequirement({
        viemClient: makeClient({ chainId: CHAIN_ID + 1, isAuthorized: true }),
        chainId: CHAIN_ID,
        userAddress: USER_A,
      }),
    ).rejects.toThrow(ChainIdMismatchError);
  });

  test("returns null when GeneralAdapter1 is already authorized", async () => {
    await expect(
      getIrisAuthorizationRequirement({
        viemClient: makeClient({ chainId: CHAIN_ID, isAuthorized: true }),
        chainId: CHAIN_ID,
        userAddress: USER_A,
      }),
    ).resolves.toBeNull();
  });

  test("builds an authorization transaction when authorization is missing", async () => {
    const tx = await getIrisAuthorizationRequirement({
      viemClient: makeClient({ chainId: CHAIN_ID, isAuthorized: false }),
      chainId: CHAIN_ID,
      userAddress: USER_A,
    });

    if (tx == null || isRequirementSignature(tx)) {
      throw new Error("expected an authorization transaction");
    }
    expect(tx.to).toBe(iris);
    expect(tx.value).toBe(0n);
    expect(tx.action.type).toBe("irisAuthorization");
    expect(tx.action.args.authorized).toBe(generalAdapter1);

    const decoded = decodeFunctionData({ abi: irisAbi, data: tx.data });
    expect(decoded.functionName).toBe("setAuthorization");
    expect(decoded.args).toEqual([generalAdapter1, true]);
  });

  test("behavior: returns a signable requirement when supportSignature is true", async () => {
    const requirement = await getIrisAuthorizationRequirement({
      viemClient: makeClient({ chainId: CHAIN_ID, isAuthorized: false }),
      chainId: CHAIN_ID,
      userAddress: USER_A,
      supportSignature: true,
    });

    if (requirement == null || !isRequirementSignature(requirement)) {
      throw new Error("expected a signable authorization requirement");
    }
    if (requirement.action.type !== "authorization") {
      throw new Error("expected an authorization action");
    }
    expect(requirement.action.args.authorized).toBe(generalAdapter1);
    expect(requirement.action.args.isAuthorized).toBe(true);
  });
});
