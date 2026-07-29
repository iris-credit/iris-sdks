import type { Address, Client } from "viem";
import type { MockClientHandle } from "@iris-credit/test/mock";

import { erc20Abi, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { beforeEach, describe, expect, test } from "vitest";
import { getChainAddresses, MathLib } from "@iris-credit/core-sdk";
import { createMockClient, expectReadCall, mockRead } from "@iris-credit/test/mock";
import { CHAIN_ID, USER_A } from "../../../test/fixtures/iris.js";
import { ChainIdMismatchError, NonPositiveInputError } from "../../types/index.js";
import { getSolverRequirements } from "./getSolverRequirements.js";

describe("getSolverRequirements", () => {
  const {
    iris,
    permit2,
    tokens: { USDC, USDT },
  } = getChainAddresses(CHAIN_ID);

  const solver: Address = USER_A;
  const bond = 1_000_000n;

  let mockClient: Client;
  let mockHandle: MockClientHandle;

  /** Each mode reads exactly one ERC-20 allowance, so one registration per token suffices. */
  const mockAllowance = (token: Address, allowance: bigint) => {
    mockRead(mockHandle, {
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      result: allowance,
    });
  };

  beforeEach(() => {
    mockHandle = createMockClient(mainnet);
    mockClient = mockHandle.client;
  });

  test("default: approves the Iris core when the standing allowance is short", async () => {
    mockAllowance(USDC, 0n);

    const requirements = await getSolverRequirements(mockClient, {
      chainId: CHAIN_ID,
      solver,
      debtToken: USDC,
      bond,
    });

    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.to).toBe(USDC);
    expect(requirements[0]?.action.args.spender).toBe(iris);
    expect(requirements[0]?.action.args.amount).toBe(maxUint256);

    // Standing-allowance mode measures what Iris itself may pull.
    expect(
      expectReadCall(mockHandle, {
        address: USDC,
        abi: erc20Abi,
        functionName: "allowance",
      }).map((call) => call.args),
    ).toEqual([[solver, iris]]);
  });

  test("behavior: returns no approval when the standing allowance already covers the bond", async () => {
    mockAllowance(USDC, bond);

    await expect(
      getSolverRequirements(mockClient, {
        chainId: CHAIN_ID,
        solver,
        debtToken: USDC,
        bond,
      }),
    ).resolves.toEqual([]);
  });

  test("behavior: usePermit2 approves the Permit2 contract for an infinite amount", async () => {
    mockAllowance(USDC, 0n);

    const requirements = await getSolverRequirements(mockClient, {
      chainId: CHAIN_ID,
      solver,
      debtToken: USDC,
      bond,
      usePermit2: true,
    });

    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.action.args.spender).toBe(permit2);
    expect(requirements[0]?.action.args.amount).toBe(MathLib.MAX_UINT_160);

    // Permit2 mode measures the allowance granted to Permit2, not to Iris.
    expect(
      expectReadCall(mockHandle, {
        address: USDC,
        abi: erc20Abi,
        functionName: "allowance",
      }).map((call) => call.args),
    ).toEqual([[solver, permit2]]);
  });

  test("behavior: usePermit2 returns no approval when the Permit2 allowance is sufficient", async () => {
    mockAllowance(USDC, bond);

    await expect(
      getSolverRequirements(mockClient, {
        chainId: CHAIN_ID,
        solver,
        debtToken: USDC,
        bond,
        usePermit2: true,
      }),
    ).resolves.toEqual([]);
  });

  test("behavior: propagates the approve-only-once reset for USDT", async () => {
    mockAllowance(USDT, 1n);

    const requirements = await getSolverRequirements(mockClient, {
      chainId: CHAIN_ID,
      solver,
      debtToken: USDT,
      bond,
    });

    expect(requirements.map((requirement) => requirement.action.args.amount)).toEqual([
      0n,
      maxUint256,
    ]);
    expect(requirements.every((requirement) => requirement.action.args.spender === iris)).toBe(
      true,
    );
  });

  test("error: ChainIdMismatchError", async () => {
    const clientWithWrongChain = { chain: { id: 137 } } as unknown as Client;

    await expect(
      getSolverRequirements(clientWithWrongChain, {
        chainId: CHAIN_ID,
        solver,
        debtToken: USDC,
        bond,
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });

  test("error: NonPositiveInputError when the bond is zero", async () => {
    await expect(
      getSolverRequirements(mockClient, {
        chainId: CHAIN_ID,
        solver,
        debtToken: USDC,
        bond: 0n,
      }),
    ).rejects.toBeInstanceOf(NonPositiveInputError);
  });
});
