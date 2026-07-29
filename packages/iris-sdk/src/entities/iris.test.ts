import type { Address } from "viem";
import type { Quote } from "@iris-credit/core-sdk";
import type { MockClientHandle } from "@iris-credit/test/mock";
import type { SolverPermit2 } from "../types/index.js";

import { decodeFunctionData, erc20Abi, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { beforeEach, describe, expect, test } from "vitest";
import {
  BP,
  getChainAddresses,
  irisAbi,
  MAX_DURATION,
  MAX_FIXED_RATE,
  MAX_OVERDUE_PERIOD,
  MAX_OVERDUE_RATE,
  MIN_DURATION,
  permit2Abi,
} from "@iris-credit/core-sdk";
import { createMockClient, expectReadCall, mockRead } from "@iris-credit/test/mock";
import { CHAIN_ID, DEBT_TOKEN, ROGUE, SIGNATURE } from "../../test/fixtures/iris.js";
import {
  authorizationSignature,
  decodeBundle,
  quote as buildQuote,
} from "../../test/helpers/iris.js";
import { irisViemExtension } from "../client/index.js";
import {
  AddressMismatchError,
  ChainIdMismatchError,
  isRequirementApproval,
  isRequirementIrisAuthorization,
  NativeAmountExceedsCollateralError,
  NativeAmountOnNonWNativeAssetError,
  NegativeInputError,
  NonPositiveInputError,
  NotAllowedVenueError,
  NotMultipleOfBpError,
  QuoteExpiredError,
  QuoteOutOfBoundsError,
  SolverPermit2AmountBelowBondError,
  SolverPermit2AssetMismatchError,
  SolverPermit2ExpiredError,
  ZeroAddressError,
} from "../types/index.js";

const {
  iris,
  permit2,
  wNative,
  bundler3: { bundler3, generalAdapter1 },
} = getChainAddresses(CHAIN_ID);

const quoteSignature = SIGNATURE;

const solverPermit2 = (
  overrides: { token?: Address; amount?: bigint; expiration?: number } = {},
): SolverPermit2 => ({
  permitSingle: {
    details: {
      token: overrides.token ?? DEBT_TOKEN,
      amount: overrides.amount ?? 10_000n,
      expiration: overrides.expiration ?? 1_900_000_000,
      nonce: 0,
    },
    sigDeadline: 1_900_000_000n,
  },
  signature: SIGNATURE,
});

describe("Iris.take", () => {
  let handle: MockClientHandle;

  /** Builds the chain-scoped entity on a mock-transport client (no connected account). */
  const makeIris = (options?: { supportSignature?: boolean }) =>
    handle.client.extend(irisViemExtension(options)).iris.core(CHAIN_ID);

  /** Registers the reads `getRequirements` performs for a borrower with no approvals in place. */
  const mockRequirementReads = (
    reads: {
      token?: Address;
      erc20Allowance?: bigint;
      isAuthorized?: boolean;
      permit2Allowance?: readonly [bigint, number, number];
    } = {},
  ) => {
    mockRead(handle, {
      address: reads.token ?? buildQuote().collateralToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: reads.erc20Allowance ?? 0n,
    });
    mockRead(handle, {
      address: iris,
      abi: irisAbi,
      functionName: "isAuthorized",
      result: reads.isAuthorized ?? false,
    });
    if (reads.permit2Allowance != null) {
      mockRead(handle, {
        address: permit2,
        abi: permit2Abi,
        functionName: "allowance",
        result: reads.permit2Allowance,
      });
    }
  };

  /** The take arguments a valid quote produces, so each test overrides only what it exercises. */
  const takeParams = (quote: Quote, overrides: { nativeAmount?: bigint } = {}) => ({
    userAddress: quote.borrower,
    quote,
    quoteSignature,
    ...overrides,
  });

  beforeEach(() => {
    handle = createMockClient(mainnet);
  });

  // The SDK does not enforce builder = signer: the take initiator is pinned to `quote.borrower`,
  // not to the connected account, so a client with no account must still build a valid tx.
  describe("builder = signer freedom", () => {
    test("builds a take tx with a client that has no connected account", () => {
      const quote = buildQuote();

      const tx = makeIris().take(takeParams(quote)).buildTx();

      expect(handle.client.account).toBeUndefined();
      expect(tx.to).toBe(bundler3);
      expect(tx.action.type).toBe("irisTake");
      expect(tx.action.args.quote).toEqual(quote);
    });
  });

  describe("validation", () => {
    test("error: ChainIdMismatchError when the client chain differs", () => {
      const otherChainHandle = createMockClient({ ...mainnet, id: 137 });
      const otherIris = otherChainHandle.client.extend(irisViemExtension()).iris.core(CHAIN_ID);

      expect(() => otherIris.take(takeParams(buildQuote()))).toThrow(ChainIdMismatchError);
    });

    test("error: AddressMismatchError when userAddress is not the quote's borrower", () => {
      const quote = buildQuote();

      expect(() => makeIris().take({ ...takeParams(quote), userAddress: ROGUE })).toThrow(
        AddressMismatchError,
      );
    });

    test("error: QuoteExpiredError", () => {
      expect(() => makeIris().take(takeParams(buildQuote({ deadline: 1n })))).toThrow(
        QuoteExpiredError,
      );
    });

    test.each(["borrower", "receiver", "collateralToken", "debtToken"] as const)(
      "error: ZeroAddressError on a zero %s",
      (field) => {
        const quote = buildQuote({ [field]: zeroAddress });

        expect(() => makeIris().take(takeParams(quote))).toThrow(ZeroAddressError);
      },
    );

    test.each([
      { field: "collateral", value: 0n },
      { field: "collateral", value: -1n },
      { field: "debt", value: 0n },
      { field: "bond", value: 0n },
    ] as const)("error: NonPositiveInputError on $field $value", ({ field, value }) => {
      expect(() => makeIris().take(takeParams(buildQuote({ [field]: value })))).toThrow(
        NonPositiveInputError,
      );
    });

    test("error: NegativeInputError when nativeAmount is negative", () => {
      const quote = buildQuote({ collateralToken: wNative });

      expect(() => makeIris().take(takeParams(quote, { nativeAmount: -1n }))).toThrow(
        NegativeInputError,
      );
    });

    test("error: NativeAmountExceedsCollateralError", () => {
      const quote = buildQuote({ collateralToken: wNative });

      expect(() =>
        makeIris().take(takeParams(quote, { nativeAmount: quote.collateral + 1n })),
      ).toThrow(NativeAmountExceedsCollateralError);
    });

    test("error: NativeAmountOnNonWNativeAssetError", () => {
      const quote = buildQuote();

      expect(() => makeIris().take(takeParams(quote, { nativeAmount: quote.collateral }))).toThrow(
        NativeAmountOnNonWNativeAssetError,
      );
    });

    test.each([
      { field: "fixedRate", value: MAX_FIXED_RATE + BP },
      { field: "fixedRate", value: -BP },
      { field: "duration", value: MIN_DURATION - 1n },
      { field: "duration", value: MAX_DURATION + 1n },
      { field: "overdueRate", value: MAX_OVERDUE_RATE + BP },
      { field: "overduePeriod", value: MAX_OVERDUE_PERIOD + 1n },
      { field: "overduePeriod", value: -1n },
    ] as const)("error: QuoteOutOfBoundsError on $field", ({ field, value }) => {
      expect(() => makeIris().take(takeParams(buildQuote({ [field]: value })))).toThrow(
        QuoteOutOfBoundsError,
      );
    });

    test.each(["fixedRate", "overdueRate"] as const)(
      "error: NotMultipleOfBpError on a sub-BP %s",
      (field) => {
        const quote = buildQuote({ [field]: BP + 1n });

        expect(() => makeIris().take(takeParams(quote))).toThrow(NotMultipleOfBpError);
      },
    );

    test.each([
      { description: "the venue is not set in the bitmap", venueId: 1n, venueBitmap: 1n },
      { description: "the venue id exceeds the bitmap width", venueId: 256n, venueBitmap: 1n },
    ])("error: NotAllowedVenueError when $description", ({ venueId, venueBitmap }) => {
      expect(() => makeIris().take(takeParams(buildQuote({ venueId, venueBitmap })))).toThrow(
        NotAllowedVenueError,
      );
    });

    test("error: SolverPermit2AssetMismatchError", () => {
      const quote = buildQuote();

      expect(() =>
        makeIris().take({ ...takeParams(quote), solverPermit2: solverPermit2({ token: ROGUE }) }),
      ).toThrow(SolverPermit2AssetMismatchError);
    });

    test("error: SolverPermit2AmountBelowBondError", () => {
      const quote = buildQuote();

      expect(() =>
        makeIris().take({
          ...takeParams(quote),
          solverPermit2: solverPermit2({ amount: quote.bond - 1n }),
        }),
      ).toThrow(SolverPermit2AmountBelowBondError);
    });

    test("error: SolverPermit2ExpiredError", () => {
      const quote = buildQuote();

      expect(() =>
        makeIris().take({ ...takeParams(quote), solverPermit2: solverPermit2({ expiration: 1 }) }),
      ).toThrow(SolverPermit2ExpiredError);
    });

    test("behavior: accepts a quote sitting exactly on the protocol bounds", () => {
      const quote = buildQuote({
        fixedRate: MAX_FIXED_RATE,
        duration: MIN_DURATION,
        overdueRate: MAX_OVERDUE_RATE,
        overduePeriod: MAX_OVERDUE_PERIOD,
      });

      expect(() => makeIris().take(takeParams(quote))).not.toThrow();
    });
  });

  describe("validation order", () => {
    test("error: QuoteExpiredError before the quote's field checks", () => {
      const quote = buildQuote({ deadline: 1n, collateral: 0n, receiver: zeroAddress });

      expect(() => makeIris().take(takeParams(quote))).toThrow(QuoteExpiredError);
    });
  });

  describe("getRequirements", () => {
    test("default: includes the collateral approval and the Iris authorization", async () => {
      const quote = buildQuote();
      mockRequirementReads({ isAuthorized: false });

      const requirements = await makeIris().take(takeParams(quote)).getRequirements();

      expect(requirements).toHaveLength(2);
      const [approval, authorization] = requirements;
      if (!isRequirementApproval(approval)) {
        throw new Error("expected an ERC-20 approval transaction");
      }
      if (!isRequirementIrisAuthorization(authorization)) {
        throw new Error("expected an Iris authorization transaction");
      }
      expect(approval.to).toBe(quote.collateralToken);
      expect(approval.action.args.amount).toBe(quote.collateral);
      // A bundled take runs through GeneralAdapter1: it must hold the collateral allowance and
      // be the account the borrower authorizes on Iris.
      expect(approval.action.args.spender).toBe(generalAdapter1);
      expect(authorization.to).toBe(iris);
      expect(authorization.action.args.authorized).toBe(generalAdapter1);
      expect(authorization.action.args.isAuthorized).toBe(true);

      expect(
        expectReadCall(handle, {
          address: iris,
          abi: irisAbi,
          functionName: "isAuthorized",
        }).map((call) => call.args),
      ).toEqual([[quote.borrower, generalAdapter1]]);
      expect(
        expectReadCall(handle, {
          address: quote.collateralToken,
          abi: erc20Abi,
          functionName: "allowance",
        }).map((call) => call.args),
      ).toEqual([[quote.borrower, generalAdapter1]]);
    });

    test("behavior: omits the authorization when GeneralAdapter1 is already authorized", async () => {
      const quote = buildQuote();
      mockRequirementReads({ isAuthorized: true });

      const requirements = await makeIris().take(takeParams(quote)).getRequirements();

      expect(requirements).toHaveLength(1);
      expect(isRequirementApproval(requirements[0])).toBe(true);
    });

    test("behavior: approves only the ERC-20 remainder when part of the collateral is native", async () => {
      const quote = buildQuote({ collateralToken: wNative });
      const nativeAmount = quote.collateral / 4n;
      mockRequirementReads({ token: wNative, isAuthorized: true });

      const [approval] = await makeIris()
        .take(takeParams(quote, { nativeAmount }))
        .getRequirements();

      if (!isRequirementApproval(approval)) {
        throw new Error("expected an ERC-20 approval transaction");
      }
      expect(approval.action.args.amount).toBe(quote.collateral - nativeAmount);
    });

    test("behavior: emits no ERC-20 requirement on a fully native funding", async () => {
      const quote = buildQuote({ collateralToken: wNative });
      mockRequirementReads({ token: wNative, isAuthorized: true });

      const requirements = await makeIris()
        .take(takeParams(quote, { nativeAmount: quote.collateral }))
        .getRequirements();

      expect(requirements).toEqual([]);
    });

    test("behavior: emits no approval when the collateral allowance already covers the pull", async () => {
      const quote = buildQuote();
      mockRequirementReads({ erc20Allowance: quote.collateral, isAuthorized: true });

      await expect(makeIris().take(takeParams(quote)).getRequirements()).resolves.toEqual([]);
    });

    test("behavior: supportSignature routes to signable permit2 and authorization requirements", async () => {
      const quote = buildQuote();
      mockRequirementReads({
        erc20Allowance: 0n,
        isAuthorized: false,
        permit2Allowance: [0n, 0, 0],
      });

      const requirements = await makeIris({ supportSignature: true })
        .take(takeParams(quote))
        .getRequirements();

      // Permit2 prerequisite approval, the permit2 signature, then the signable authorization.
      expect(requirements).toHaveLength(3);
      expect(isRequirementApproval(requirements[0])).toBe(true);
      expect(requirements[1]?.action.type).toBe("permit2");
      expect(requirements[2]?.action.type).toBe("authorization");
      // Signable rather than a standalone transaction: it carries a `sign()` callback.
      expect(requirements[2] != null && "sign" in requirements[2]).toBe(true);
    });
  });

  describe("buildTx", () => {
    test("behavior: passes the signed authorization through to the bundle", () => {
      const quote = buildQuote();
      const signed = authorizationSignature();

      const calls = decodeBundle(makeIris().take(takeParams(quote)).buildTx([signed]).data);

      expect(calls[0]?.to).toBe(iris);
      expect(decodeFunctionData({ abi: irisAbi, data: calls[0]!.data }).functionName).toBe(
        "setAuthorizationWithSig",
      );
    });

    test("behavior: passes the solver Permit2 payload through to the bundle", () => {
      const quote = buildQuote();

      const calls = decodeBundle(
        makeIris()
          .take({ ...takeParams(quote), solverPermit2: solverPermit2() })
          .buildTx().data,
      );

      expect(calls[0]?.to).toBe(permit2);
      expect(decodeFunctionData({ abi: permit2Abi, data: calls[0]!.data }).args?.[0]).toBe(
        quote.solver,
      );
    });
  });
});
