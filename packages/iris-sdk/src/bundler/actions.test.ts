import type { Address } from "viem";
import type { Quote } from "@iris-credit/core-sdk";
import type { BundlerCall } from "./actions.js";
import type { Action, Permit2PermitSingle } from "./type.js";

import fc from "fast-check";
import {
  bytesToHex,
  decodeFunctionData,
  encodeAbiParameters,
  isAddressEqual,
  keccak256,
  parseSignature,
  zeroHash,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  erc2612Abi,
  getChainAddresses,
  irisAbi,
  permit2Abi,
  UnsupportedChainIdError,
} from "@iris-credit/core-sdk";
import {
  ADAPTER,
  CHAIN_ID,
  ERC4626,
  POD,
  RECEIVER,
  ROGUE,
  SIGNATURE,
  UNSUPPORTED_CHAIN_ID,
} from "../../test/fixtures/iris.js";
import { decodeBundle, quote as buildQuote } from "../../test/helpers/iris.js";
import { bundler3Abi, generalAdapter1 as generalAdapter1Abi } from "../abis/index.js";
import { BundlerErrors } from "../types/index.js";
import { BundlerAction } from "./actions.js";

describe("BundlerAction", () => {
  const chainId = CHAIN_ID;
  const {
    iris,
    permit2,
    bundler3: { bundler3, generalAdapter1 },
  } = getChainAddresses(chainId);

  const owner = "0x0000000000000000000000000000000000000001" as Address;
  const asset = "0x0000000000000000000000000000000000000002" as Address;
  const recipient = RECEIVER;
  const adapter = ADAPTER;
  const erc4626 = ERC4626;

  const quote = buildQuote();

  const permitSingle = {
    details: {
      token: asset,
      amount: 11n,
      expiration: 123,
      nonce: 7,
    },
    sigDeadline: 456n,
  } satisfies Permit2PermitSingle;

  const authorization = {
    authorizer: owner,
    authorized: generalAdapter1,
    isAuthorized: true,
    nonce: 0n,
    deadline: 1_900_000_000n,
  } as const;

  const signature = SIGNATURE;

  const addressArbitrary = fc
    .uint8Array({ minLength: 20, maxLength: 20 })
    .map((bytes) => bytesToHex(bytes) as Address);
  const hexArbitrary = fc.uint8Array({ maxLength: 8 }).map((bytes) => bytesToHex(bytes));
  const amountArbitrary = fc.bigInt({ min: 0n, max: 10n ** 24n });
  const permitNumberArbitrary = fc.integer({ min: 0, max: 1_000_000 });
  const skipRevertArbitrary = fc.boolean();
  const permitSingleArbitrary = fc.record({
    details: fc.record({
      token: addressArbitrary,
      amount: amountArbitrary,
      expiration: permitNumberArbitrary,
      nonce: permitNumberArbitrary,
    }),
    sigDeadline: amountArbitrary,
  });
  const quoteArbitrary: fc.Arbitrary<Quote> = fc.record({
    borrower: addressArbitrary,
    solver: addressArbitrary,
    receiver: addressArbitrary,
    blm: addressArbitrary,
    collateralToken: addressArbitrary,
    debtToken: addressArbitrary,
    collateral: amountArbitrary,
    debt: amountArbitrary,
    fixedRate: amountArbitrary,
    duration: amountArbitrary,
    overdueRate: amountArbitrary,
    overduePeriod: amountArbitrary,
    bond: amountArbitrary,
    bondLltv: amountArbitrary,
    venueBitmap: amountArbitrary,
    venueId: amountArbitrary,
    deadline: amountArbitrary,
    nonce: amountArbitrary,
    data: hexArbitrary,
  });
  const authorizationArbitrary = fc
    .tuple(addressArbitrary, fc.boolean(), amountArbitrary, amountArbitrary)
    .map(([authorizer, isAuthorized, nonce, deadline]) => ({
      authorizer,
      // The encoder pins `authorized` to GeneralAdapter1; anything else throws by design.
      authorized: generalAdapter1,
      isAuthorized,
      nonce,
      deadline,
    }));
  const callbackActionArbitrary = fc
    .tuple(
      addressArbitrary,
      addressArbitrary,
      amountArbitrary,
      addressArbitrary,
      skipRevertArbitrary,
    )
    .map(
      (args) =>
        ({
          type: "erc20Transfer",
          args,
        }) satisfies Action,
    );
  const actionArbitrary: fc.Arbitrary<Action> = fc.oneof(
    fc
      .tuple(addressArbitrary, addressArbitrary, amountArbitrary, skipRevertArbitrary)
      .map((args) => ({ type: "nativeTransfer", args }) satisfies Action),
    callbackActionArbitrary,
    fc
      .tuple(addressArbitrary, amountArbitrary, addressArbitrary, skipRevertArbitrary)
      .map((args) => ({ type: "erc20TransferFrom", args }) satisfies Action),
    fc
      .tuple(
        addressArbitrary,
        addressArbitrary,
        amountArbitrary,
        amountArbitrary,
        fc.constant(signature),
        skipRevertArbitrary,
      )
      .map((args) => ({ type: "permit", args }) satisfies Action),
    fc
      .tuple(addressArbitrary, permitSingleArbitrary, fc.constant(signature), skipRevertArbitrary)
      .map((args) => ({ type: "approve2", args }) satisfies Action),
    fc
      .tuple(addressArbitrary, permitSingleArbitrary, fc.constant(signature), skipRevertArbitrary)
      .map((args) => ({ type: "approve2Iris", args }) satisfies Action),
    fc
      .tuple(addressArbitrary, amountArbitrary, addressArbitrary, skipRevertArbitrary)
      .map((args) => ({ type: "transferFrom2", args }) satisfies Action),
    fc
      .tuple(
        addressArbitrary,
        amountArbitrary,
        amountArbitrary,
        addressArbitrary,
        skipRevertArbitrary,
      )
      .map((args) => ({ type: "erc4626Deposit", args }) satisfies Action),
    fc
      .tuple(
        addressArbitrary,
        amountArbitrary,
        amountArbitrary,
        addressArbitrary,
        addressArbitrary,
        skipRevertArbitrary,
      )
      .map((args) => ({ type: "erc4626Redeem", args }) satisfies Action),
    fc
      .tuple(authorizationArbitrary, fc.constant(signature), skipRevertArbitrary)
      .map((args) => ({ type: "irisSetAuthorizationWithSig", args }) satisfies Action),
    fc
      .tuple(quoteArbitrary, fc.constant(signature), skipRevertArbitrary)
      .map((args) => ({ type: "irisTake", args }) satisfies Action),
    fc
      .tuple(addressArbitrary, addressArbitrary, skipRevertArbitrary)
      .map((args) => ({ type: "irisRepay", args }) satisfies Action),
    fc
      .tuple(addressArbitrary, addressArbitrary, amountArbitrary, skipRevertArbitrary)
      .map((args) => ({ type: "irisSupplyCollateral", args }) satisfies Action),
    fc
      .tuple(addressArbitrary, amountArbitrary, addressArbitrary, skipRevertArbitrary)
      .map((args) => ({ type: "irisWithdrawCollateral", args }) satisfies Action),
    fc
      .tuple(addressArbitrary, addressArbitrary, amountArbitrary, skipRevertArbitrary)
      .map((args) => ({ type: "irisSupplyBond", args }) satisfies Action),
    fc
      .tuple(addressArbitrary, amountArbitrary, addressArbitrary, skipRevertArbitrary)
      .map((args) => ({ type: "irisWithdrawBond", args }) satisfies Action),
    fc
      .tuple(addressArbitrary, addressArbitrary, amountArbitrary, hexArbitrary, skipRevertArbitrary)
      .map((args) => ({ type: "irisRefinance", args }) satisfies Action),
    fc
      .tuple(addressArbitrary, addressArbitrary, skipRevertArbitrary)
      .map((args) => ({ type: "irisEscape", args }) satisfies Action),
    fc
      .tuple(addressArbitrary, amountArbitrary, addressArbitrary, skipRevertArbitrary)
      .map((args) => ({ type: "irisClaim", args }) satisfies Action),
    fc
      .tuple(
        addressArbitrary,
        amountArbitrary,
        fc.array(callbackActionArbitrary, { maxLength: 2 }),
        skipRevertArbitrary,
      )
      .map((args) => ({ type: "morphoFlashLoan", args }) satisfies Action),
    fc
      .tuple(amountArbitrary, addressArbitrary, skipRevertArbitrary)
      .map((args) => ({ type: "wrapNative", args }) satisfies Action),
  );
  const bundleActionArbitrary: fc.Arbitrary<Action> = fc.oneof(
    actionArbitrary,
    fc.tuple(addressArbitrary, amountArbitrary, skipRevertArbitrary).map(
      ([prefundOwner, amount, skipRevert]) =>
        ({
          type: "nativeTransfer",
          args: [prefundOwner, bundler3, amount, skipRevert],
        }) satisfies Action,
    ),
    fc.tuple(amountArbitrary, skipRevertArbitrary).map(
      ([amount, skipRevert]) =>
        ({
          type: "nativeTransfer",
          args: [bundler3, generalAdapter1, amount, skipRevert],
        }) satisfies Action,
    ),
  );

  const onlyCall = (calls: readonly BundlerCall[]) => {
    expect(calls).toHaveLength(1);
    const [call] = calls;
    if (call == null) throw new Error("Expected one BundlerCall");

    return call;
  };

  const callbackCall = {
    to: adapter,
    data: "0x1234",
    value: 5n,
    skipRevert: true,
    callbackHash: zeroHash,
  } satisfies BundlerCall;

  const expectedBundleValue = (actions: readonly Action[]) => {
    let value = 0n;
    let availableBundlerValue = 0n;

    const consumeCall = (call: BundlerCall) => {
      if (call.value > availableBundlerValue) {
        value += call.value - availableBundlerValue;
        availableBundlerValue = 0n;
      } else {
        availableBundlerValue -= call.value;
      }
    };

    const accountAction = (action: Action) => {
      if (action.type === "nativeTransfer") {
        const [transferOwner, transferRecipient, amount] = action.args;

        if (
          !isAddressEqual(transferOwner, bundler3) &&
          !isAddressEqual(transferOwner, generalAdapter1) &&
          isAddressEqual(transferRecipient, bundler3)
        ) {
          value += amount;
          availableBundlerValue += amount;
        }
      }

      for (const call of BundlerAction.encode(chainId, action)) {
        consumeCall(call);
      }

      if (action.type === "morphoFlashLoan") {
        const [, , callbackActions] = action.args;
        for (const callbackAction of callbackActions) accountAction(callbackAction);
      }
    };

    for (const action of actions) {
      accountAction(action);
    }

    return value;
  };

  test("encode accepts arbitrary supported actions deterministically", () => {
    fc.assert(
      fc.property(actionArbitrary, (action) => {
        const calls = BundlerAction.encode(chainId, action);

        expect(calls).toStrictEqual(BundlerAction.encode(chainId, action));
        for (const call of calls) {
          expect(call.to).toMatch(/^0x[0-9a-f]{40}$/i);
          expect(call.data).toMatch(/^0x(?:[0-9a-f]{2})*$/i);
          expect(call.value >= 0n).toBe(true);
          expect(call.callbackHash).toMatch(/^0x[0-9a-f]{64}$/i);
        }
      }),
      { numRuns: 100, seed: 669 },
    );
  });

  test("encodeBundle derives value from native pre-funding and call values", () => {
    fc.assert(
      fc.property(fc.array(bundleActionArbitrary, { maxLength: 20 }), (actions) => {
        expect(BundlerAction.encodeBundle(chainId, actions).value).toBe(
          expectedBundleValue(actions),
        );
      }),
      { numRuns: 100, seed: 670 },
    );
  });

  test("encodeBundle", () => {
    const actions: Action[] = [
      {
        type: "nativeTransfer",
        args: [owner, generalAdapter1, 100n, false],
      },
      {
        type: "nativeTransfer",
        args: [owner, bundler3, 23n, false],
      },
      {
        type: "nativeTransfer",
        args: [bundler3, generalAdapter1, 11n, false],
      },
      {
        type: "nativeTransfer",
        args: [generalAdapter1, recipient, 7n, true],
      },
      {
        type: "erc20Transfer",
        args: [asset, recipient, 5n, adapter, false],
      },
    ];

    const tx = BundlerAction.encodeBundle(chainId, actions);

    expect(tx.to).toBe(bundler3);
    expect(tx.value).toBe(123n);

    const calls = decodeBundle(tx.data);

    // The transfer into Bundler3 emits no inner call — it only pre-funds the later ones.
    expect(calls).toHaveLength(4);
    expect(calls.map((call) => [call.to, call.value])).toEqual([
      [generalAdapter1, 100n],
      [generalAdapter1, 11n],
      [generalAdapter1, 0n],
      [adapter, 0n],
    ]);
    expect(calls[0]?.data).toBe("0x");
    expect(calls[1]?.data).toBe("0x");
    expect(decodeFunctionData({ abi: generalAdapter1Abi, data: calls[2]!.data }).functionName).toBe(
      "nativeTransfer",
    );
    expect(decodeFunctionData({ abi: generalAdapter1Abi, data: calls[3]!.data }).functionName).toBe(
      "erc20Transfer",
    );
  });

  test("encodeBundle uses native transfers to Bundler3 before adding call value", () => {
    const tx = BundlerAction.encodeBundle(chainId, [
      {
        type: "nativeTransfer",
        args: [owner, bundler3, 5n, false],
      },
      {
        type: "nativeTransfer",
        args: [bundler3, generalAdapter1, 5n, false],
      },
    ]);

    expect(tx.value).toBe(5n);

    const calls = decodeBundle(tx.data);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.value).toBe(5n);
  });

  test("encodeBundle includes callback action values in transaction value", () => {
    const tx = BundlerAction.encodeBundle(chainId, [
      {
        type: "morphoFlashLoan",
        args: [
          asset,
          1n,
          [
            {
              type: "nativeTransfer",
              args: [owner, recipient, 5n, false],
            },
          ],
          false,
        ],
      },
    ]);

    expect(tx.value).toBe(5n);

    const calls = decodeBundle(tx.data);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.value).toBe(0n);
    expect(calls[0]?.callbackHash).not.toBe(zeroHash);
  });

  test.each([
    {
      description: "preserves excess prefunded value",
      actions: [
        {
          type: "nativeTransfer",
          args: [owner, bundler3, 10n, false],
        },
        {
          type: "nativeTransfer",
          args: [bundler3, generalAdapter1, 5n, false],
        },
      ],
      value: 10n,
    },
    {
      description: "adds only the deficit across multiple value calls",
      actions: [
        {
          type: "nativeTransfer",
          args: [owner, bundler3, 5n, false],
        },
        {
          type: "nativeTransfer",
          args: [bundler3, generalAdapter1, 4n, false],
        },
        {
          type: "nativeTransfer",
          args: [bundler3, generalAdapter1, 4n, false],
        },
      ],
      value: 8n,
    },
    {
      description: "drains multiple pre-fundings before adding excess call value",
      actions: [
        {
          type: "nativeTransfer",
          args: [owner, bundler3, 5n, false],
        },
        {
          type: "nativeTransfer",
          args: [recipient, bundler3, 5n, false],
        },
        {
          type: "nativeTransfer",
          args: [bundler3, generalAdapter1, 12n, false],
        },
      ],
      value: 12n,
    },
  ] satisfies {
    description: string;
    actions: Action[];
    value: bigint;
  }[])("encodeBundle $description", ({ actions, value }) => {
    expect(BundlerAction.encodeBundle(chainId, actions).value).toBe(value);
    expect(value).toBe(expectedBundleValue(actions));
  });

  test("encodeBundle matches registry addresses case-insensitively", () => {
    const lowerBundler3 = bundler3.toLowerCase() as Address;
    const lowerGeneralAdapter1 = generalAdapter1.toLowerCase() as Address;
    const preloadTx = BundlerAction.encodeBundle(chainId, [
      {
        type: "nativeTransfer",
        args: [owner, lowerBundler3, 5n, false],
      },
    ]);
    const tx = BundlerAction.encodeBundle(chainId, [
      {
        type: "nativeTransfer",
        args: [owner, lowerBundler3, 5n, false],
      },
      {
        type: "nativeTransfer",
        args: [owner, lowerGeneralAdapter1, 7n, false],
      },
    ]);

    expect(preloadTx.value).toBe(5n);
    expect(tx.value).toBe(7n);

    const calls = decodeBundle(tx.data);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.to.toLowerCase()).toBe(lowerGeneralAdapter1);
    expect(calls[0]?.value).toBe(7n);
  });

  test("error: UnsupportedChainIdError on an unsupported chain", () => {
    expect(() => BundlerAction.encodeBundle(UNSUPPORTED_CHAIN_ID, [])).toThrow(
      UnsupportedChainIdError,
    );
    expect(() =>
      BundlerAction.encode(UNSUPPORTED_CHAIN_ID, {
        type: "wrapNative",
        args: [1n, recipient, false],
      }),
    ).toThrow(UnsupportedChainIdError);
  });

  test.each(
    (
      [
        [
          "nativeTransfer",
          {
            type: "nativeTransfer",
            args: [owner, recipient, 1n, false],
          },
          BundlerAction.nativeTransfer(chainId, owner, recipient, 1n, false),
        ],
        [
          "erc20Transfer",
          {
            type: "erc20Transfer",
            args: [asset, recipient, 2n, adapter, false],
          },
          BundlerAction.erc20Transfer(asset, recipient, 2n, adapter, false),
        ],
        [
          "erc20TransferFrom",
          {
            type: "erc20TransferFrom",
            args: [asset, 3n, recipient, false],
          },
          BundlerAction.erc20TransferFrom(chainId, asset, 3n, recipient, false),
        ],
        [
          "permit",
          {
            type: "permit",
            args: [owner, asset, 4n, 5n, signature, false],
          },
          BundlerAction.permit(chainId, owner, asset, 4n, 5n, signature, false),
        ],
        [
          "approve2",
          {
            type: "approve2",
            args: [owner, permitSingle, signature, false],
          },
          BundlerAction.approve2(chainId, owner, permitSingle, signature, false),
        ],
        [
          "approve2Iris",
          {
            type: "approve2Iris",
            args: [owner, permitSingle, signature, false],
          },
          BundlerAction.approve2Iris(chainId, owner, permitSingle, signature, false),
        ],
        [
          "transferFrom2",
          {
            type: "transferFrom2",
            args: [asset, 6n, recipient, false],
          },
          BundlerAction.transferFrom2(chainId, asset, 6n, recipient, false),
        ],
        [
          "erc4626Deposit",
          {
            type: "erc4626Deposit",
            args: [erc4626, 7n, 8n, recipient, false],
          },
          BundlerAction.erc4626Deposit(chainId, erc4626, 7n, 8n, recipient, false),
        ],
        [
          "erc4626Redeem",
          {
            type: "erc4626Redeem",
            args: [erc4626, 9n, 10n, recipient, owner, false],
          },
          BundlerAction.erc4626Redeem(chainId, erc4626, 9n, 10n, recipient, owner, false),
        ],
        [
          "irisSetAuthorizationWithSig",
          {
            type: "irisSetAuthorizationWithSig",
            args: [authorization, signature, false],
          },
          BundlerAction.irisSetAuthorizationWithSig(chainId, authorization, signature, false),
        ],
        [
          "irisTake",
          {
            type: "irisTake",
            args: [quote, signature, false],
          },
          BundlerAction.irisTake(chainId, quote, signature, false),
        ],
        [
          "irisRepay",
          {
            type: "irisRepay",
            args: [POD, asset, false],
          },
          BundlerAction.irisRepay(chainId, POD, asset, false),
        ],
        [
          "irisSupplyCollateral",
          {
            type: "irisSupplyCollateral",
            args: [POD, asset, 11n, false],
          },
          BundlerAction.irisSupplyCollateral(chainId, POD, asset, 11n, false),
        ],
        [
          "irisWithdrawCollateral",
          {
            type: "irisWithdrawCollateral",
            args: [POD, 12n, recipient, false],
          },
          BundlerAction.irisWithdrawCollateral(chainId, POD, 12n, recipient, false),
        ],
        [
          "irisSupplyBond",
          {
            type: "irisSupplyBond",
            args: [POD, asset, 13n, false],
          },
          BundlerAction.irisSupplyBond(chainId, POD, asset, 13n, false),
        ],
        [
          "irisWithdrawBond",
          {
            type: "irisWithdrawBond",
            args: [POD, 14n, recipient, false],
          },
          BundlerAction.irisWithdrawBond(chainId, POD, 14n, recipient, false),
        ],
        [
          "irisRefinance",
          {
            type: "irisRefinance",
            args: [POD, recipient, 15n, "0x1234", false],
          },
          BundlerAction.irisRefinance(chainId, POD, recipient, 15n, "0x1234", false),
        ],
        [
          "irisEscape",
          {
            type: "irisEscape",
            args: [POD, recipient, false],
          },
          BundlerAction.irisEscape(chainId, POD, recipient, false),
        ],
        [
          "irisClaim",
          {
            type: "irisClaim",
            args: [asset, 16n, recipient, false],
          },
          BundlerAction.irisClaim(chainId, asset, 16n, recipient, false),
        ],
        [
          "morphoFlashLoan",
          {
            type: "morphoFlashLoan",
            args: [
              asset,
              17n,
              [
                {
                  type: "erc20Transfer",
                  args: [asset, recipient, 18n, adapter],
                },
              ],
              false,
            ],
          },
          BundlerAction.morphoFlashLoan(
            chainId,
            asset,
            17n,
            BundlerAction.erc20Transfer(asset, recipient, 18n, adapter),
            false,
          ),
        ],
        [
          "wrapNative",
          {
            type: "wrapNative",
            args: [19n, recipient, false],
          },
          BundlerAction.wrapNative(chainId, 19n, recipient, false),
        ],
      ] satisfies [Action["type"], Action, BundlerCall[]][]
    ).map(([type, action, calls]) => ({ type, action, calls })),
  )("encode dispatches $type", ({ action, calls }) => {
    expect(BundlerAction.encode(chainId, action)).toStrictEqual(calls);
  });

  test("nativeTransfer", () => {
    const lowerBundler3 = bundler3.toLowerCase() as Address;
    const lowerGeneralAdapter1 = generalAdapter1.toLowerCase() as Address;

    expect(BundlerAction.nativeTransfer(chainId, owner, bundler3, 1n)).toStrictEqual([]);
    expect(BundlerAction.nativeTransfer(chainId, owner, lowerBundler3, 1n)).toStrictEqual([]);

    const adapterCall = onlyCall(
      BundlerAction.nativeTransfer(chainId, generalAdapter1, recipient, 2n, true),
    );
    const adapterCallData = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: adapterCall.data,
    });

    expect(adapterCall.to).toBe(generalAdapter1);
    expect(adapterCall.skipRevert).toBe(false);
    expect(adapterCallData.functionName).toBe("nativeTransfer");
    expect(adapterCallData.args).toEqual([recipient, 2n]);

    const lowercasedAdapterCall = onlyCall(
      BundlerAction.nativeTransfer(chainId, lowerGeneralAdapter1, recipient, 2n, true),
    );
    const lowercasedAdapterCallData = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: lowercasedAdapterCall.data,
    });

    expect(lowercasedAdapterCall.to).toBe(generalAdapter1);
    expect(lowercasedAdapterCall.skipRevert).toBe(false);
    expect(lowercasedAdapterCallData.functionName).toBe("nativeTransfer");
    expect(lowercasedAdapterCallData.args).toEqual([recipient, 2n]);

    const directCall = onlyCall(BundlerAction.nativeTransfer(chainId, owner, recipient, 3n, true));

    expect(directCall).toStrictEqual({
      to: recipient,
      data: "0x",
      value: 3n,
      skipRevert: true,
      callbackHash: zeroHash,
    });
  });

  test("erc20Transfer", () => {
    const call = onlyCall(BundlerAction.erc20Transfer(asset, recipient, 1n, adapter, true));
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(adapter);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("erc20Transfer");
    expect(decoded.args).toEqual([asset, recipient, 1n]);
  });

  test("erc20TransferFrom", () => {
    const call = onlyCall(BundlerAction.erc20TransferFrom(chainId, asset, 1n, recipient, true));
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("erc20TransferFrom");
    expect(decoded.args).toEqual([asset, recipient, 1n]);
  });

  test("permit", () => {
    const call = onlyCall(BundlerAction.permit(chainId, owner, asset, 1n, 2n, signature, false));
    const decoded = decodeFunctionData({
      abi: erc2612Abi,
      data: call.data,
    });
    const { r, s, yParity } = parseSignature(signature);

    expect(call.to).toBe(asset);
    expect(decoded.functionName).toBe("permit");
    expect(decoded.args).toEqual([owner, generalAdapter1, 1n, 2n, yParity + 27, r, s]);
  });

  test("permit defaults to skipRevert", () => {
    expect(
      onlyCall(BundlerAction.permit(chainId, owner, asset, 1n, 2n, signature)).skipRevert,
    ).toBe(true);
  });

  test("approve2", () => {
    const call = onlyCall(BundlerAction.approve2(chainId, owner, permitSingle, signature, false));
    const decoded = decodeFunctionData({
      abi: permit2Abi,
      data: call.data,
    });

    expect(call.to).toBe(permit2);
    expect(decoded.functionName).toBe("permit");
    expect(decoded.args).toEqual([owner, { ...permitSingle, spender: generalAdapter1 }, signature]);
  });

  test("approve2Iris pins the spender to the Iris core", () => {
    const call = onlyCall(
      BundlerAction.approve2Iris(chainId, owner, permitSingle, signature, false),
    );
    const decoded = decodeFunctionData({
      abi: permit2Abi,
      data: call.data,
    });

    expect(call.to).toBe(permit2);
    expect(decoded.functionName).toBe("permit");
    expect(decoded.args).toEqual([owner, { ...permitSingle, spender: iris }, signature]);
  });

  test("transferFrom2", () => {
    const call = onlyCall(BundlerAction.transferFrom2(chainId, asset, 1n, recipient, true));
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("permit2TransferFrom");
    expect(decoded.args).toEqual([asset, recipient, 1n]);
  });

  describe("irisSetAuthorizationWithSig", () => {
    test("default", () => {
      const call = onlyCall(
        BundlerAction.irisSetAuthorizationWithSig(chainId, authorization, signature, false),
      );
      const decoded = decodeFunctionData({ abi: irisAbi, data: call.data });

      expect(call.to).toBe(iris);
      expect(call.skipRevert).toBe(false);
      expect(decoded.functionName).toBe("setAuthorizationWithSig");
      expect(decoded.args).toEqual([authorization, signature]);
    });

    test("behavior: defaults to skipRevert so a used nonce does not fail the bundle", () => {
      expect(
        onlyCall(BundlerAction.irisSetAuthorizationWithSig(chainId, authorization, signature))
          .skipRevert,
      ).toBe(true);
    });

    test("behavior: accepts a Signature object", () => {
      const hexCall = onlyCall(
        BundlerAction.irisSetAuthorizationWithSig(chainId, authorization, signature, false),
      );
      const objectCall = onlyCall(
        BundlerAction.irisSetAuthorizationWithSig(
          chainId,
          authorization,
          parseSignature(signature),
          false,
        ),
      );

      expect(objectCall.data).toBe(hexCall.data);
    });

    test("error: UnexpectedSignature when authorized is not GeneralAdapter1", () => {
      const notGeneralAdapter1: Address[] = [bundler3, iris, ROGUE];
      for (const authorized of notGeneralAdapter1) {
        expect(() =>
          BundlerAction.irisSetAuthorizationWithSig(
            chainId,
            { ...authorization, authorized },
            signature,
          ),
        ).toThrow(BundlerErrors.UnexpectedSignature);
      }
    });

    test("error: MissingSignature via encode", () => {
      expect(() =>
        BundlerAction.encode(chainId, {
          type: "irisSetAuthorizationWithSig",
          args: [authorization, null, false],
        }),
      ).toThrow(BundlerErrors.MissingSignature);
    });
  });

  describe("signature normalization", () => {
    test("behavior: permit accepts a Signature object", () => {
      const hexCall = onlyCall(
        BundlerAction.permit(chainId, owner, asset, 4n, 5n, signature, false),
      );
      const objectCall = onlyCall(
        BundlerAction.permit(chainId, owner, asset, 4n, 5n, parseSignature(signature), false),
      );

      expect(objectCall.data).toBe(hexCall.data);
    });

    test("behavior: approve2 accepts a Signature object", () => {
      const hexCall = onlyCall(
        BundlerAction.approve2(chainId, owner, permitSingle, signature, false),
      );
      const objectCall = onlyCall(
        BundlerAction.approve2(chainId, owner, permitSingle, parseSignature(signature), false),
      );

      expect(objectCall.data).toBe(hexCall.data);
    });

    test("behavior: approve2Iris accepts a Signature object", () => {
      const hexCall = onlyCall(
        BundlerAction.approve2Iris(chainId, owner, permitSingle, signature, false),
      );
      const objectCall = onlyCall(
        BundlerAction.approve2Iris(chainId, owner, permitSingle, parseSignature(signature), false),
      );

      expect(objectCall.data).toBe(hexCall.data);
    });

    test("behavior: irisTake accepts a Signature object", () => {
      const hexCall = onlyCall(BundlerAction.irisTake(chainId, quote, signature, false));
      const objectCall = onlyCall(
        BundlerAction.irisTake(chainId, quote, parseSignature(signature), false),
      );

      expect(objectCall.data).toBe(hexCall.data);
    });
  });

  test("erc4626Deposit", () => {
    const call = onlyCall(BundlerAction.erc4626Deposit(chainId, erc4626, 1n, 2n, recipient, true));
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("erc4626Deposit");
    expect(decoded.args).toEqual([erc4626, 1n, 2n, recipient]);
  });

  test("erc4626Redeem", () => {
    const call = onlyCall(
      BundlerAction.erc4626Redeem(chainId, erc4626, 1n, 2n, recipient, owner, true),
    );
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("erc4626Redeem");
    expect(decoded.args).toEqual([erc4626, 1n, 2n, recipient, owner]);
  });

  test("irisTake", () => {
    const call = onlyCall(BundlerAction.irisTake(chainId, quote, signature, true));
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("irisTake");
    expect(decoded.args).toEqual([quote, signature]);
  });

  test("irisRepay", () => {
    const call = onlyCall(BundlerAction.irisRepay(chainId, POD, asset, true));
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("irisRepay");
    expect(decoded.args).toEqual([POD, asset]);
  });

  test("irisSupplyCollateral", () => {
    const call = onlyCall(BundlerAction.irisSupplyCollateral(chainId, POD, asset, 1n, true));
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("irisSupplyCollateral");
    expect(decoded.args).toEqual([POD, asset, 1n]);
  });

  test("irisWithdrawCollateral", () => {
    const call = onlyCall(BundlerAction.irisWithdrawCollateral(chainId, POD, 1n, recipient, true));
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("irisWithdrawCollateral");
    expect(decoded.args).toEqual([POD, 1n, recipient]);
  });

  test("irisSupplyBond", () => {
    const call = onlyCall(BundlerAction.irisSupplyBond(chainId, POD, asset, 1n, true));
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("irisSupplyBond");
    expect(decoded.args).toEqual([POD, asset, 1n]);
  });

  test("irisWithdrawBond", () => {
    const call = onlyCall(BundlerAction.irisWithdrawBond(chainId, POD, 1n, recipient, true));
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("irisWithdrawBond");
    expect(decoded.args).toEqual([POD, 1n, recipient]);
  });

  test("irisRefinance", () => {
    const call = onlyCall(BundlerAction.irisRefinance(chainId, POD, recipient, 2n, "0x1234", true));
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("irisRefinance");
    expect(decoded.args).toEqual([POD, recipient, 2n, "0x1234"]);
  });

  test("irisEscape", () => {
    const call = onlyCall(BundlerAction.irisEscape(chainId, POD, recipient, true));
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("irisEscape");
    expect(decoded.args).toEqual([POD, recipient]);
  });

  test("irisClaim", () => {
    const call = onlyCall(BundlerAction.irisClaim(chainId, asset, 1n, recipient, true));
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("irisClaim");
    expect(decoded.args).toEqual([asset, 1n, recipient]);
  });

  test("morphoFlashLoan", () => {
    const reenterAbiInputs = bundler3Abi.find(
      (item) => item.type === "function" && item.name === "reenter",
    )!.inputs;
    const reenterData = encodeAbiParameters(reenterAbiInputs, [[callbackCall]]);
    const call = onlyCall(BundlerAction.morphoFlashLoan(chainId, asset, 1n, [callbackCall], true));
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.callbackHash).toBe(keccak256(reenterData));
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("morphoFlashLoan");
    expect(decoded.args).toEqual([asset, 1n, reenterData]);
  });

  test("morphoFlashLoan without callback calls", () => {
    const call = onlyCall(BundlerAction.morphoFlashLoan(chainId, asset, 1n, [], true));
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.callbackHash).toBe(zeroHash);
    expect(decoded.args).toEqual([asset, 1n, "0x"]);
  });

  test("wrapNative", () => {
    const call = onlyCall(BundlerAction.wrapNative(chainId, 1n, recipient, true));
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("wrapNative");
    expect(decoded.args).toEqual([1n, recipient]);
  });

  test("error: MissingSignature", () => {
    expect(() =>
      BundlerAction.encode(chainId, {
        type: "permit",
        args: [owner, asset, 1n, 1n, null, false],
      }),
    ).toThrow(BundlerErrors.MissingSignature);

    expect(() =>
      BundlerAction.encode(chainId, {
        type: "approve2",
        args: [owner, permitSingle, null, false],
      }),
    ).toThrow(BundlerErrors.MissingSignature);

    expect(() =>
      BundlerAction.encode(chainId, {
        type: "approve2Iris",
        args: [owner, permitSingle, null, false],
      }),
    ).toThrow(BundlerErrors.MissingSignature);
  });
});
