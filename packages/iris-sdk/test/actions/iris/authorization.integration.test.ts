import { describe, expect } from "vitest";
import { getChainAddresses, irisAbi } from "@iris-credit/core-sdk";
import {
  BundlerAction,
  getIrisAuthorizationAction,
  getIrisAuthorizationRequirement,
  isRequirementIrisAuthorization,
  isRequirementSignature,
} from "../../../src/index.js";
import { CHAIN_ID } from "../../fixtures/iris.js";
import { test } from "../../setup.js";

describe("AuthorizationIris", () => {
  const {
    iris,
    bundler3: { generalAdapter1 },
  } = getChainAddresses(CHAIN_ID);

  test("default: the setAuthorization requirement executes and clears itself", async ({
    client,
  }) => {
    const userAddress = client.account.address;

    const requirement = await getIrisAuthorizationRequirement({
      viemClient: client,
      chainId: CHAIN_ID,
      userAddress,
    });
    if (requirement == null || !isRequirementIrisAuthorization(requirement)) {
      throw new Error("expected a setAuthorization transaction requirement");
    }
    expect(requirement.to).toBe(iris);

    await client.sendTransaction(requirement);

    await expect(
      client.readContract({
        address: iris,
        abi: irisAbi,
        functionName: "isAuthorized",
        args: [userAddress, generalAdapter1],
      }),
    ).resolves.toBe(true);
    // The satisfied requirement no longer surfaces.
    await expect(
      getIrisAuthorizationRequirement({ viemClient: client, chainId: CHAIN_ID, userAddress }),
    ).resolves.toBeNull();
  });

  test("behavior: a signed authorization executes through the bundler via setAuthorizationWithSig", async ({
    client,
  }) => {
    const userAddress = client.account.address;

    const requirement = await getIrisAuthorizationRequirement({
      viemClient: client,
      chainId: CHAIN_ID,
      userAddress,
      supportSignature: true,
    });
    if (requirement == null || !isRequirementSignature(requirement)) {
      throw new Error("expected a signable authorization requirement");
    }

    const signed = await requirement.sign(client, userAddress);
    const tx = BundlerAction.encodeBundle(CHAIN_ID, [getIrisAuthorizationAction(CHAIN_ID, signed)]);

    // Executes the EIP-712 signature against the deployed Iris — a mismatch in the mirrored
    // `Authorization` typed data would recover another signer and revert the bundle.
    await client.sendTransaction(tx);

    await expect(
      client.readContract({
        address: iris,
        abi: irisAbi,
        functionName: "isAuthorized",
        args: [userAddress, generalAdapter1],
      }),
    ).resolves.toBe(true);
  });
});
