import { isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, vi } from "vitest";
import { getChainAddresses } from "@iris-credit/core-sdk";
import { Time } from "@iris-credit/iris-ts";
import { CHAIN_ID, ROGUE, UNSUPPORTED_CHAIN_ID, USER_A } from "../../../../test/fixtures/iris.js";
import { test } from "../../../../test/setup.js";
import {
  AddressMismatchError,
  ChainIdMismatchError,
  InvalidSignatureError,
  UnsupportedErc20ApprovalSpenderError,
} from "../../../types/index.js";
import { encodeErc20Permit } from "./encodeErc20Permit.js";

describe("encodeErc20Permit", () => {
  const {
    tokens: { USDC },
    bundler3: { generalAdapter1 },
  } = getChainAddresses(CHAIN_ID);

  const mockAmount = 1000000n;
  const mockNonce = 0n;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("sign", () => {
    test("should throw ChainIdMismatchError when client chain does not match", async ({
      client,
    }) => {
      await expect(
        encodeErc20Permit(client, {
          token: USDC,
          spender: generalAdapter1,
          amount: mockAmount,
          chainId: UNSUPPORTED_CHAIN_ID,
          nonce: mockNonce,
        }),
      ).rejects.toThrow(ChainIdMismatchError);
    });

    test("should throw UnsupportedErc20ApprovalSpenderError when spender is not supported", async ({
      client,
    }) => {
      await expect(
        encodeErc20Permit(client, {
          token: USDC,
          spender: ROGUE,
          amount: mockAmount,
          chainId: CHAIN_ID,
          nonce: mockNonce,
        }),
      ).rejects.toThrow(UnsupportedErc20ApprovalSpenderError);
    });

    test("should sign permit for non-DAI token", async ({ client }) => {
      const userAddress = client.account.address;

      const permit = await encodeErc20Permit(client, {
        token: USDC,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: CHAIN_ID,
        nonce: mockNonce,
      });

      const signatureRequirement = await permit.sign(client, userAddress);

      expect(signatureRequirement.args.owner).toEqual(userAddress);
      expect(isHex(signatureRequirement.args.signature)).toBe(true);
      expect(signatureRequirement.args.signature.length).toBe(132);
    });

    test("should throw error if client account address does not match user address", async ({
      client,
    }) => {
      const permit = await encodeErc20Permit(client, {
        token: USDC,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: CHAIN_ID,
        nonce: mockNonce,
      });

      await expect(permit.sign(client, USER_A)).rejects.toThrow(
        new AddressMismatchError(client.account.address, USER_A),
      );
    });

    test("should throw InvalidSignatureError when signature verification fails", async ({
      client,
    }) => {
      const userAddress = client.account.address;
      const wrongSigner = privateKeyToAccount(
        "0x0000000000000000000000000000000000000000000000000000000000000002",
      );
      const invalidSignatureClient = {
        ...client,
        account: {
          ...wrongSigner,
          address: userAddress,
        },
      };
      const permit = await encodeErc20Permit(client, {
        token: USDC,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: CHAIN_ID,
        nonce: mockNonce,
      });

      await expect(permit.sign(invalidSignatureClient, userAddress)).rejects.toThrow(
        InvalidSignatureError,
      );
    });

    test("should return all expected properties in signature args", async ({ client }) => {
      const userAddress = client.account.address;

      const permit = await encodeErc20Permit(client, {
        token: USDC,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: CHAIN_ID,
        nonce: mockNonce,
      });

      const signatureRequirement = await permit.sign(client, userAddress);

      expect(signatureRequirement.args).toHaveProperty("owner");
      expect(signatureRequirement.args).toHaveProperty("signature");
      expect(signatureRequirement.args).toHaveProperty("deadline");
      expect(signatureRequirement.args).toHaveProperty("amount");
      expect(signatureRequirement.args).toHaveProperty("asset");
      expect(signatureRequirement.args).toHaveProperty("nonce");
      expect(signatureRequirement.args.owner).toEqual(userAddress);
      expect(signatureRequirement.args.amount).toEqual(mockAmount);
      expect(signatureRequirement.args.asset).toEqual(USDC);
      expect(signatureRequirement.args.nonce).toEqual(mockNonce);
    });

    test("should set deadline to approximately 2 hours in the future", async ({ client }) => {
      const userAddress = client.account.address;
      const now = Time.timestamp();

      const permit = await encodeErc20Permit(client, {
        token: USDC,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: CHAIN_ID,
        nonce: mockNonce,
      });

      const signatureRequirement = await permit.sign(client, userAddress);

      // Deadline should be approximately 2 hours (7200 seconds) in the future
      // Allow 5 seconds tolerance for test execution time
      const expectedDeadline = now + 7200n;
      const tolerance = 5n;

      expect(signatureRequirement.args.deadline).toBeGreaterThan(now);
      expect(signatureRequirement.args.deadline).toBeGreaterThanOrEqual(
        expectedDeadline - tolerance,
      );
      expect(signatureRequirement.args.deadline).toBeLessThanOrEqual(expectedDeadline + tolerance);
    });

    test("should have correct action structure", async ({ client }) => {
      const permit = await encodeErc20Permit(client, {
        token: USDC,
        spender: generalAdapter1,
        amount: mockAmount,
        chainId: CHAIN_ID,
        nonce: mockNonce,
      });

      expect(permit.action.type).toBe("permit");
      expect(permit.action.args).toHaveProperty("spender");
      expect(permit.action.args).toHaveProperty("amount");
      expect(permit.action.args).toHaveProperty("deadline");
      expect(permit.action.args.spender).toEqual(generalAdapter1);
      expect(permit.action.args.amount).toEqual(mockAmount);
    });
  });
});
