import type { Address } from "viem";
import type { SolverPermit2 } from "../../types/index.js";

import { decodeFunctionData, isAddressEqual } from "viem";
import { describe, expect, test } from "vitest";
import { getChainAddresses, irisAbi, permit2Abi } from "@iris-credit/core-sdk";
import { CHAIN_ID, DEBT_TOKEN, ROGUE, SIGNATURE, SOLVER } from "../../../test/fixtures/iris.js";
import {
  authorizationSignature,
  callNames,
  decodeBundle,
  quote as buildQuote,
} from "../../../test/helpers/iris.js";
import { permit2Signature, permitSignature } from "../../../test/helpers/permit.js";
import {
  NativeAmountExceedsCollateralError,
  NativeAmountOnNonWNativeAssetError,
  NegativeInputError,
  NonPositiveInputError,
  SolverPermit2AmountBelowBondError,
  SolverPermit2AssetMismatchError,
} from "../../types/index.js";
import { irisTake } from "./take.js";

const {
  iris,
  wNative,
  bundler3: { bundler3 },
} = getChainAddresses(CHAIN_ID);

const quoteSignature = SIGNATURE;

const solverPermit2 = (overrides: { token?: Address; amount?: bigint } = {}): SolverPermit2 => ({
  permitSingle: {
    details: {
      token: overrides.token ?? DEBT_TOKEN,
      amount: overrides.amount ?? 10_000n,
      expiration: 1_900_000_000,
      nonce: 0,
    },
    sigDeadline: 1_900_000_000n,
  },
  signature: SIGNATURE,
});

describe("irisTake", () => {
  test("default: creates a bundled take transaction (ERC20 only)", () => {
    const quote = buildQuote();

    const tx = irisTake({ chainId: CHAIN_ID, args: { quote, quoteSignature } });

    expect(tx.to).toBe(bundler3);
    expect(tx.value).toBe(0n);
    expect(tx.action.type).toBe("irisTake");
    expect(tx.action.args.quote).toEqual(quote);
    expect(tx.action.args.quoteSignature).toBe(quoteSignature);
    expect(callNames(decodeBundle(tx.data))).toEqual(["erc20TransferFrom", "irisTake"]);
  });

  test("behavior: does not freeze the caller's quote", () => {
    const quote = buildQuote();

    irisTake({ chainId: CHAIN_ID, args: { quote, quoteSignature } });

    expect(Object.isFrozen(quote)).toBe(false);
  });

  test("behavior: creates a take transaction with native wrapping", () => {
    const quote = buildQuote({ collateralToken: wNative });

    const tx = irisTake({
      chainId: CHAIN_ID,
      args: { quote, quoteSignature, nativeAmount: quote.collateral },
    });

    expect(tx.value).toBe(quote.collateral);
    expect(callNames(decodeBundle(tx.data))).toEqual(["nativeTransfer", "wrapNative", "irisTake"]);
  });

  test("behavior: creates a take transaction with both ERC20 and native amounts", () => {
    const quote = buildQuote({ collateralToken: wNative });
    const nativeAmount = quote.collateral / 2n;

    const tx = irisTake({ chainId: CHAIN_ID, args: { quote, quoteSignature, nativeAmount } });

    expect(tx.value).toBe(nativeAmount);
    expect(callNames(decodeBundle(tx.data))).toEqual([
      "nativeTransfer",
      "wrapNative",
      "erc20TransferFrom",
      "irisTake",
    ]);
  });

  test("behavior: creates a take transaction with a permit2 signature", () => {
    const quote = buildQuote();

    const tx = irisTake({
      chainId: CHAIN_ID,
      args: {
        quote,
        quoteSignature,
        requirementSignature: permit2Signature({
          amount: quote.collateral,
          asset: quote.collateralToken,
        }),
      },
    });

    expect(callNames(decodeBundle(tx.data))).toEqual([
      "permit2.permit",
      "permit2TransferFrom",
      "irisTake",
    ]);
  });

  test("behavior: creates a take transaction with a classic permit signature", () => {
    const quote = buildQuote();

    const tx = irisTake({
      chainId: CHAIN_ID,
      args: {
        quote,
        quoteSignature,
        requirementSignature: permitSignature({
          amount: quote.collateral,
          asset: quote.collateralToken,
        }),
      },
    });

    expect(callNames(decodeBundle(tx.data))).toEqual([
      "token.permit",
      "erc20TransferFrom",
      "irisTake",
    ]);
  });

  test("behavior: prepends the solver's Permit2 bond approval before everything else", () => {
    const quote = buildQuote();

    const tx = irisTake({
      chainId: CHAIN_ID,
      args: { quote, quoteSignature, solverPermit2: solverPermit2() },
    });

    const calls = decodeBundle(tx.data);

    expect(callNames(calls)).toEqual(["permit2.permit", "erc20TransferFrom", "irisTake"]);
    // The solver — not the taker — owns the Permit2 allowance, and Iris is the spender.
    expect(decodeFunctionData({ abi: permit2Abi, data: calls[0]!.data }).args).toEqual([
      SOLVER,
      { ...solverPermit2().permitSingle, spender: iris },
      SIGNATURE,
    ]);
  });

  test("behavior: prepends setAuthorizationWithSig when an authorization signature is provided", () => {
    const quote = buildQuote();

    const tx = irisTake({
      chainId: CHAIN_ID,
      args: { quote, quoteSignature, authorizationSignature: authorizationSignature() },
    });

    const calls = decodeBundle(tx.data);

    expect(calls[0]!.to).toBe(iris);
    expect(decodeFunctionData({ abi: irisAbi, data: calls[0]!.data }).functionName).toBe(
      "setAuthorizationWithSig",
    );
    expect(callNames(calls)).toEqual(["setAuthorizationWithSig", "erc20TransferFrom", "irisTake"]);
  });

  test("behavior: omits the authorization call when no signature is provided", () => {
    const quote = buildQuote();

    const tx = irisTake({ chainId: CHAIN_ID, args: { quote, quoteSignature } });

    for (const call of decodeBundle(tx.data)) {
      expect(isAddressEqual(call.to, iris)).toBe(false);
    }
  });

  test("behavior: orders the bond approval, the authorization, the funding and the take", () => {
    const quote = buildQuote({ collateralToken: wNative });

    const tx = irisTake({
      chainId: CHAIN_ID,
      args: {
        quote,
        quoteSignature,
        solverPermit2: solverPermit2(),
        authorizationSignature: authorizationSignature(),
        nativeAmount: quote.collateral / 2n,
      },
    });

    expect(callNames(decodeBundle(tx.data))).toEqual([
      "permit2.permit",
      "setAuthorizationWithSig",
      "nativeTransfer",
      "wrapNative",
      "erc20TransferFrom",
      "irisTake",
    ]);
  });

  test("error: NonPositiveInputError when collateral is zero", () => {
    expect(() =>
      irisTake({
        chainId: CHAIN_ID,
        args: { quote: buildQuote({ collateral: 0n }), quoteSignature },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: NonPositiveInputError when collateral is negative", () => {
    expect(() =>
      irisTake({
        chainId: CHAIN_ID,
        args: { quote: buildQuote({ collateral: -1n }), quoteSignature },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: NonPositiveInputError when debt is zero", () => {
    expect(() =>
      irisTake({ chainId: CHAIN_ID, args: { quote: buildQuote({ debt: 0n }), quoteSignature } }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: NonPositiveInputError when debt is negative", () => {
    expect(() =>
      irisTake({ chainId: CHAIN_ID, args: { quote: buildQuote({ debt: -1n }), quoteSignature } }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: NonPositiveInputError when bond is zero", () => {
    expect(() =>
      irisTake({ chainId: CHAIN_ID, args: { quote: buildQuote({ bond: 0n }), quoteSignature } }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: NegativeInputError when nativeAmount is negative", () => {
    expect(() =>
      irisTake({
        chainId: CHAIN_ID,
        args: {
          quote: buildQuote({ collateralToken: wNative }),
          quoteSignature,
          nativeAmount: -1n,
        },
      }),
    ).toThrow(NegativeInputError);
  });

  test("error: NativeAmountExceedsCollateralError when nativeAmount exceeds the collateral", () => {
    const quote = buildQuote({ collateralToken: wNative });

    expect(() =>
      irisTake({
        chainId: CHAIN_ID,
        args: { quote, quoteSignature, nativeAmount: quote.collateral + 1n },
      }),
    ).toThrow(NativeAmountExceedsCollateralError);
  });

  test("error: NativeAmountOnNonWNativeAssetError for non-wNative collateral", () => {
    expect(() =>
      irisTake({
        chainId: CHAIN_ID,
        args: { quote: buildQuote(), quoteSignature, nativeAmount: 1_000n },
      }),
    ).toThrow(NativeAmountOnNonWNativeAssetError);
  });

  test("error: SolverPermit2AssetMismatchError when the bond payload signs another token", () => {
    expect(() =>
      irisTake({
        chainId: CHAIN_ID,
        args: {
          quote: buildQuote(),
          quoteSignature,
          solverPermit2: solverPermit2({ token: ROGUE }),
        },
      }),
    ).toThrow(SolverPermit2AssetMismatchError);
  });

  test("error: SolverPermit2AmountBelowBondError when the bond payload signs too little", () => {
    const quote = buildQuote();

    expect(() =>
      irisTake({
        chainId: CHAIN_ID,
        args: {
          quote,
          quoteSignature,
          solverPermit2: solverPermit2({ amount: quote.bond - 1n }),
        },
      }),
    ).toThrow(SolverPermit2AmountBelowBondError);
  });

  test("behavior: returns a deep-frozen transaction object", () => {
    const tx = irisTake({
      chainId: CHAIN_ID,
      args: { quote: buildQuote(), quoteSignature },
    });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
    expect(Object.isFrozen(tx.action.args.quote)).toBe(true);
  });
});
