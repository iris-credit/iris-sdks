import { isHex, verifyTypedData } from "viem";
import { describe, expect } from "vitest";
import { getAuthorizationTypedData, getChainAddresses } from "@iris-credit/core-sdk";
import { encodeIrisSignatureAuthorization } from "../../../../src/actions/requirements/encode/encodeIrisSignatureAuthorization.js";
import { AddressMismatchError, ChainIdMismatchError } from "../../../../src/types/index.js";
import { CHAIN_ID, UNSUPPORTED_CHAIN_ID, USER_A } from "../../../fixtures/iris.js";
import { test } from "../../../setup.js";

const {
  bundler3: { generalAdapter1 },
} = getChainAddresses(CHAIN_ID);

describe("encodeIrisSignatureAuthorization", () => {
  test("error: ChainIdMismatchError when client chain differs", async ({ client }) => {
    expect(() =>
      encodeIrisSignatureAuthorization(client, {
        authorized: generalAdapter1,
        chainId: UNSUPPORTED_CHAIN_ID,
        nonce: 0n,
      }),
    ).toThrow(ChainIdMismatchError);
  });

  test("default: signs a verifiable Iris authorization", async ({ client }) => {
    const requirement = encodeIrisSignatureAuthorization(client, {
      authorized: generalAdapter1,
      chainId: CHAIN_ID,
      nonce: 0n,
    });

    expect(requirement.action.type).toBe("authorization");

    const signed = await requirement.sign(client, client.account.address);

    expect(signed.action.type).toBe("authorization");
    expect(signed.args.owner).toBe(client.account.address);
    expect(signed.args.authorized).toBe(generalAdapter1);
    expect(signed.args.isAuthorized).toBe(true);
    expect(signed.args.nonce).toBe(0n);
    expect(isHex(signed.args.signature)).toBe(true);
    expect(signed.args.signature.length).toBe(132);

    const typedData = getAuthorizationTypedData(CHAIN_ID, {
      authorizer: client.account.address,
      authorized: generalAdapter1,
      isAuthorized: true,
      nonce: 0n,
      deadline: signed.args.deadline,
    });
    await expect(
      verifyTypedData({
        ...typedData,
        address: client.account.address,
        signature: signed.args.signature,
      }),
    ).resolves.toBe(true);
  });

  test("behavior: supports revocation via isAuthorized=false", async ({ client }) => {
    const requirement = encodeIrisSignatureAuthorization(client, {
      authorized: generalAdapter1,
      chainId: CHAIN_ID,
      nonce: 1n,
      isAuthorized: false,
    });

    const signed = await requirement.sign(client, client.account.address);

    expect(signed.args.isAuthorized).toBe(false);
    expect(requirement.action.args.isAuthorized).toBe(false);
  });

  test("behavior: defaults to a random nonce because Iris nonces are unordered", async ({
    client,
  }) => {
    const sign = async () => {
      const requirement = encodeIrisSignatureAuthorization(client, {
        authorized: generalAdapter1,
        chainId: CHAIN_ID,
      });

      return (await requirement.sign(client, client.account.address)).args.nonce;
    };

    expect(await sign()).not.toBe(await sign());
  });

  test("error: AddressMismatchError when signer differs from userAddress", async ({ client }) => {
    const requirement = encodeIrisSignatureAuthorization(client, {
      authorized: generalAdapter1,
      chainId: CHAIN_ID,
      nonce: 0n,
    });

    await expect(requirement.sign(client, USER_A)).rejects.toBeInstanceOf(AddressMismatchError);
  });
});
