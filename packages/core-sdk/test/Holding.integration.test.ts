import { maxUint256 } from "viem";
import { describe, expect } from "vitest";
import { Holding } from "../src/augment/Holding.js";
import { ChainId, fetchHolding, getChainAddresses, NATIVE_ADDRESS } from "../src/index.js";
import { test } from "./setup.js";

const { iris, permit2, tokens } = getChainAddresses(ChainId.EthMainnet);

describe("fetchHolding (mainnet fork)", () => {
  test("should fetch an ERC20 holding", { timeout: 30_000 }, async ({ client }) => {
    const user = client.account.address;
    await client.deal({ erc20: tokens.USDC, account: user, amount: 1_000_000n });

    const holding = await fetchHolding(user, tokens.USDC, client);

    expect(holding.user).toBe(user);
    expect(holding.token).toBe(tokens.USDC);
    expect(holding.balance).toBe(1_000_000n);
    expect(holding.erc20Allowances).toStrictEqual({ iris: 0n, permit2: 0n });
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

  test("should reflect a live ERC20 approval", { timeout: 30_000 }, async ({ client }) => {
    const user = client.account.address;
    await client.deal({ erc20: tokens.USDC, account: user, amount: 1n });
    await client.approve({ address: tokens.USDC, args: [iris, 7n] });
    await client.approve({ address: tokens.USDC, args: [permit2, maxUint256] });

    const holding = await fetchHolding(user, tokens.USDC, client);

    expect(holding.erc20Allowances).toStrictEqual({ iris: 7n, permit2: maxUint256 });
  });

  test("should fetch a native holding", { timeout: 30_000 }, async ({ client }) => {
    const user = client.account.address;

    const holding = await fetchHolding(user, NATIVE_ADDRESS, client);

    expect(holding.token).toBe(NATIVE_ADDRESS);
    expect(holding.balance).toBe(await client.getBalance({ address: user }));
    // Native transfers need no allowance: the placeholders keep requirement math uniform.
    expect(holding.erc20Allowances).toStrictEqual({
      iris: maxUint256,
      permit2: maxUint256,
    });
  });

  test(
    "should expose the same read through the augmented static",
    { timeout: 30_000 },
    async ({ client }) => {
      const user = client.account.address;
      await client.deal({ erc20: tokens.WETH, account: user, amount: 3n });

      expect((await Holding.fetch(user, tokens.WETH, client)).balance).toBe(3n);
    },
  );
});
