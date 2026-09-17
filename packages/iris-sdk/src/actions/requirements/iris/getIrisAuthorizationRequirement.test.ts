import { createWalletClient, custom, decodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { getChainAddresses, irisAbi } from "@iris-credit/core-sdk";
import { createMockClient, expectReadCall, mockRead } from "@iris-credit/test/mock";
import { CHAIN_ID, USER_A } from "../../../../test/fixtures/iris.js";
import { ChainIdMismatchError, isRequirementSignature } from "../../../types/index.js";
import { getIrisAuthorizationRequirement } from "./getIrisAuthorizationRequirement.js";

const {
  iris,
  bundler3: { generalAdapter1 },
} = getChainAddresses(CHAIN_ID);

/** Registers the `isAuthorized` read, and the `nonce` read the signable path adds. */
function mockClient({
  chainId = CHAIN_ID,
  isAuthorized,
  nonce = 0n,
}: {
  chainId?: number;
  isAuthorized: boolean;
  nonce?: bigint;
}) {
  const handle = createMockClient({ ...mainnet, id: chainId });
  mockRead(handle, {
    address: iris,
    abi: irisAbi,
    functionName: "isAuthorized",
    result: isAuthorized,
  });
  mockRead(handle, { address: iris, abi: irisAbi, functionName: "nonce", result: nonce });

  return handle;
}

describe("getIrisAuthorizationRequirement", () => {
  test("throws ChainIdMismatchError when the client chain differs", async () => {
    await expect(
      getIrisAuthorizationRequirement({
        viemClient: mockClient({ chainId: CHAIN_ID + 1, isAuthorized: true }).client,
        chainId: CHAIN_ID,
        userAddress: USER_A,
      }),
    ).rejects.toThrow(ChainIdMismatchError);
  });

  test("returns null when GeneralAdapter1 is already authorized", async () => {
    const handle = mockClient({ isAuthorized: true });

    await expect(
      getIrisAuthorizationRequirement({
        viemClient: handle.client,
        chainId: CHAIN_ID,
        userAddress: USER_A,
      }),
    ).resolves.toBeNull();

    expect(
      expectReadCall(handle, { address: iris, abi: irisAbi, functionName: "isAuthorized" }).map(
        (call) => call.args,
      ),
    ).toEqual([[USER_A, generalAdapter1]]);
  });

  test("builds an authorization transaction when authorization is missing", async () => {
    const tx = await getIrisAuthorizationRequirement({
      viemClient: mockClient({ isAuthorized: false }).client,
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
      viemClient: mockClient({ isAuthorized: false }).client,
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

  test("behavior: the signable requirement signs the user's onchain authorization nonce", async () => {
    // Anvil's first default account: a local signer, so `sign()` needs no RPC to sign, and viem's
    // `verifyTypedData` falls back to ECDSA recovery when the mock transport rejects its call.
    const account = privateKeyToAccount(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    );
    const handle = mockClient({ isAuthorized: false, nonce: 7n });
    const walletClient = createWalletClient({
      account,
      chain: handle.chain,
      transport: custom({ request: handle.request }),
    });

    const requirement = await getIrisAuthorizationRequirement({
      viemClient: handle.client,
      chainId: CHAIN_ID,
      userAddress: account.address,
      supportSignature: true,
    });

    if (requirement == null || !isRequirementSignature(requirement)) {
      throw new Error("expected a signable authorization requirement");
    }
    const signed = await requirement.sign(walletClient, account.address);

    expect(signed.args.nonce).toBe(7n);
    expect(
      expectReadCall(handle, { address: iris, abi: irisAbi, functionName: "nonce" }).map(
        (call) => call.args,
      ),
    ).toEqual([[account.address]]);
  });
});
