import { isHex, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect } from "vitest";
import {
  getChainAddresses,
  getPermit2PermitTypedData,
  MathLib,
  permit2Abi,
} from "@iris-credit/core-sdk";
import { CHAIN_ID, UNSUPPORTED_CHAIN_ID, USER_A } from "../../../test/fixtures/iris.js";
import { test } from "../../../test/setup.js";
import {
  AddressMismatchError,
  ChainIdMismatchError,
  InvalidSignatureError,
  NonPositiveInputError,
} from "../../types/index.js";
import { signSolverPermit2 } from "./signSolverPermit2.js";

describe("signSolverPermit2", () => {
  const {
    iris,
    permit2,
    tokens: { USDC },
  } = getChainAddresses(CHAIN_ID);

  const bond = 1_000_000n;
  const deadline = 1_900_000_000n;

  test("default: signs a bond payload spendable by the Iris core", async ({ client }) => {
    const solver = client.account.address;

    const solverPermit2 = await signSolverPermit2(client, {
      solver,
      debtToken: USDC,
      bond,
      chainId: CHAIN_ID,
      deadline,
      nonce: 0n,
    });

    expect(solverPermit2.permitSingle).toEqual({
      details: {
        token: USDC,
        amount: bond,
        expiration: Number(MathLib.MAX_UINT_48),
        nonce: 0,
      },
      sigDeadline: deadline,
    });
    expect(isHex(solverPermit2.signature)).toBe(true);
    expect(solverPermit2.signature.length).toBe(132);

    // The signed spender is the Iris core — never GeneralAdapter1.
    await expect(
      verifyTypedData({
        ...getPermit2PermitTypedData(
          {
            erc20: USDC,
            allowance: bond,
            nonce: 0,
            deadline,
            spender: iris,
            expiration: Number(MathLib.MAX_UINT_48),
          },
          CHAIN_ID,
        ),
        address: solver,
        signature: solverPermit2.signature,
      }),
    ).resolves.toBe(true);
  });

  test("behavior: defaults the nonce to the solver's on-chain Permit2 nonce", async ({
    client,
  }) => {
    const solver = client.account.address;

    // Bump the (solver, USDC, iris) nonce on-chain so the default is distinguishable from 0.
    await client.writeContract({
      abi: permit2Abi,
      address: permit2,
      functionName: "invalidateNonces",
      args: [USDC, iris, 3],
    });

    const solverPermit2Payload = await signSolverPermit2(client, {
      solver,
      debtToken: USDC,
      bond,
      chainId: CHAIN_ID,
      deadline,
    });

    expect(solverPermit2Payload.permitSingle.details.nonce).toBe(3);
  });

  test("behavior: returns a deep-frozen payload", async ({ client }) => {
    const solverPermit2 = await signSolverPermit2(client, {
      solver: client.account.address,
      debtToken: USDC,
      bond,
      chainId: CHAIN_ID,
      deadline,
      nonce: 0n,
    });

    expect(Object.isFrozen(solverPermit2)).toBe(true);
    expect(Object.isFrozen(solverPermit2.permitSingle)).toBe(true);
    expect(Object.isFrozen(solverPermit2.permitSingle.details)).toBe(true);
  });

  test("error: ChainIdMismatchError", async ({ client }) => {
    await expect(
      signSolverPermit2(client, {
        solver: client.account.address,
        debtToken: USDC,
        bond,
        chainId: UNSUPPORTED_CHAIN_ID,
        deadline,
        nonce: 0n,
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });

  test("error: NonPositiveInputError when the bond is zero", async ({ client }) => {
    await expect(
      signSolverPermit2(client, {
        solver: client.account.address,
        debtToken: USDC,
        bond: 0n,
        chainId: CHAIN_ID,
        deadline,
        nonce: 0n,
      }),
    ).rejects.toBeInstanceOf(NonPositiveInputError);
  });

  test("error: AddressMismatchError when the account is not the solver", async ({ client }) => {
    await expect(
      signSolverPermit2(client, {
        solver: USER_A,
        debtToken: USDC,
        bond,
        chainId: CHAIN_ID,
        deadline,
        nonce: 0n,
      }),
    ).rejects.toBeInstanceOf(AddressMismatchError);
  });

  test("error: InvalidSignatureError", async ({ client }) => {
    const wrongSigner = privateKeyToAccount(
      "0x0000000000000000000000000000000000000000000000000000000000000002",
    );
    const invalidSignatureClient = {
      ...client,
      account: { ...wrongSigner, address: client.account.address },
    };

    await expect(
      signSolverPermit2(invalidSignatureClient, {
        solver: client.account.address,
        debtToken: USDC,
        bond,
        chainId: CHAIN_ID,
        deadline,
        nonce: 0n,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });
});
