import type { RpcHandler } from "@iris-credit/test/mock";

import { erc20Abi, maxUint256, numberToHex } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { createMockClient, expectReadCall, mockRead } from "@iris-credit/test/mock";
import { USER } from "../../../test/fixtures/iris.js";
import { permit2Abi } from "../../abis/permit2.js";
import { getChainAddresses, NATIVE_ADDRESS } from "../../addresses.js";
import { ChainId } from "../../chain.js";
import { UnsupportedChainIdError } from "../../errors.js";
import { fetchHolding } from "./fetch.js";

const { iris, permit2, bundler3, tokens } = getChainAddresses(ChainId.EthMainnet);

/**
 * A mock client whose ERC20 and Permit2 reads all resolve. `mockRead` keys on
 * `(address, selector)` only, so both Permit2 spenders share one response —
 * spender routing is asserted through the call history instead.
 */
const mockErc20Client = () => {
  const handle = createMockClient(mainnet);

  mockRead(handle, {
    address: tokens.USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    result: 1_000_000n,
  });
  mockRead(handle, {
    address: tokens.USDC,
    abi: erc20Abi,
    functionName: "allowance",
    result: 7n,
  });
  mockRead(handle, {
    address: permit2,
    abi: permit2Abi,
    functionName: "allowance",
    result: [123n, 456, 789],
  });

  return handle;
};

/** Answers `eth_getBalance` with `balance`, leaving the mock's `eth_call` dispatch intact. */
const mockNativeBalance = (handle: ReturnType<typeof createMockClient>, balance: bigint) => {
  const base = handle.request.getMockImplementation() as RpcHandler;
  handle.request.mockImplementation(async (call) =>
    call.method === "eth_getBalance" ? numberToHex(balance) : base(call),
  );
};

describe("fetchHolding", () => {
  test("default", async () => {
    const handle = mockErc20Client();
    const holding = await fetchHolding(USER, tokens.USDC, handle.client);

    expect(holding.user).toBe(USER);
    expect(holding.token).toBe(tokens.USDC);
    expect(holding.balance).toBe(1_000_000n);
    expect(holding.erc20Allowances).toStrictEqual({ iris: 7n, permit2: 7n });
  });

  test("behavior: normalizes the Permit2 allowance tuple to bigints", async () => {
    const handle = mockErc20Client();
    const holding = await fetchHolding(USER, tokens.USDC, handle.client);

    expect(holding.permit2IrisAllowance).toStrictEqual({
      amount: 123n,
      expiration: 456n,
      nonce: 789n,
    });
    expect(holding.permit2BundlerAllowance).toStrictEqual({
      amount: 123n,
      expiration: 456n,
      nonce: 789n,
    });
  });

  test("behavior: routes the two Permit2 reads to Iris and to the general adapter", async () => {
    const handle = mockErc20Client();

    await fetchHolding(USER, tokens.USDC, handle.client);

    expect(
      expectReadCall(handle, {
        address: permit2,
        abi: permit2Abi,
        functionName: "allowance",
      }).map(({ args }) => args),
    ).toStrictEqual([
      [USER, tokens.USDC, iris],
      [USER, tokens.USDC, bundler3.generalAdapter1],
    ]);
  });

  test("behavior: routes the ERC20 allowance reads to each registry recipient", async () => {
    const handle = mockErc20Client();

    await fetchHolding(USER, tokens.USDC, handle.client);

    expect(
      expectReadCall(handle, {
        address: tokens.USDC,
        abi: erc20Abi,
        functionName: "allowance",
      }).map(({ args }) => args),
    ).toStrictEqual([
      [USER, iris],
      [USER, permit2],
    ]);
  });

  test("behavior: normalizes the token casing", async () => {
    const handle = mockErc20Client();
    const holding = await fetchHolding(
      USER,
      tokens.USDC.toLowerCase() as typeof tokens.USDC,
      handle.client,
    );

    expect(holding.token).toBe(tokens.USDC);
  });

  test("behavior: short-circuits the native token to unlimited ERC20 allowances", async () => {
    const handle = createMockClient(mainnet);
    mockNativeBalance(handle, 42n);

    const holding = await fetchHolding(USER, NATIVE_ADDRESS, handle.client);

    expect(holding.balance).toBe(42n);
    expect(holding.erc20Allowances).toStrictEqual({
      iris: maxUint256,
      permit2: maxUint256,
    });
    expect(holding.permit2IrisAllowance).toStrictEqual({
      amount: 0n,
      expiration: 0n,
      nonce: 0n,
    });
    expect(holding.permit2BundlerAllowance).toStrictEqual({
      amount: 0n,
      expiration: 0n,
      nonce: 0n,
    });
  });

  test("behavior: reads no contract for a native holding", async () => {
    const handle = createMockClient(mainnet);
    mockNativeBalance(handle, 0n);

    await fetchHolding(USER, NATIVE_ADDRESS, handle.client, { chainId: ChainId.EthMainnet });

    expect(handle.request.mock.calls.map(([call]) => call.method)).toStrictEqual([
      "eth_getBalance",
    ]);
  });

  test("error: UnsupportedChainIdError", async () => {
    const handle = mockErc20Client();

    await expect(
      fetchHolding(USER, tokens.USDC, handle.client, { chainId: 999 as ChainId }),
    ).rejects.toBeInstanceOf(UnsupportedChainIdError);
  });
});
