import type { Address, Hex, Signature } from "viem";
import type { Authorization, ChainId, Quote } from "@iris-credit/core-sdk";
import type { Action, Permit2PermitSingle } from "./type.js";

import {
  encodeAbiParameters,
  encodeFunctionData,
  isAddressEqual,
  keccak256,
  serializeSignature,
  zeroHash,
} from "viem";
import { getChainAddresses, irisAbi, permit2Abi } from "@iris-credit/core-sdk";
import { bundler3Abi, generalAdapter1 as generalAdapter1Abi } from "../abis/index.js";
import { BundlerErrors } from "../types/index.js";

/**
 * Encoded low-level call consumed by Bundler3's `multicall`.
 */
export interface BundlerCall {
  /** Contract or account called by Bundler3. */
  readonly to: Address;

  /** ABI-encoded calldata sent to `to`. */
  readonly data: Hex;

  /** Native-token value sent with the call. */
  readonly value: bigint;

  /** Whether Bundler3 should continue when the call reverts. */
  readonly skipRevert: boolean;

  /** Expected callback hash for calls that reenter Bundler3, or zero hash. */
  readonly callbackHash: Hex;
}

const reenterAbiInputs = bundler3Abi.find(
  (item) => item.type === "function" && item.name === "reenter",
)!.inputs;

const encodeCallbackCalls = (callbackCalls: BundlerCall[]) => {
  const reenter = callbackCalls.length > 0;
  const reenterData = reenter ? encodeAbiParameters(reenterAbiInputs, [callbackCalls]) : "0x";

  return {
    callbackHash: reenter ? keccak256(reenterData) : zeroHash,
    reenterData,
  } as const;
};

interface BundleValueState {
  readonly value: bigint;
  readonly availableBundlerValue: bigint;
}

interface EncodeBundleActionParams {
  readonly chainId: ChainId;
  readonly action: Action;
  readonly valueState: BundleValueState;
}

interface EncodeBundleActionResult {
  readonly calls: BundlerCall[];
  readonly valueState: BundleValueState;
}

const addBundlerPrefund = (state: BundleValueState, amount: bigint): BundleValueState => ({
  value: state.value + amount,
  availableBundlerValue: state.availableBundlerValue + amount,
});

/**
 * Normalizes a raw ECDSA signature to its hex form. Integrators get a `Hex` from
 * `signTypedData`/`signMessage` and a viem `Signature` object from the low-level
 * `sign`; both are accepted so no manual conversion is required at the call site.
 */
const toSignatureHex = (signature: Hex | Signature): Hex =>
  typeof signature === "string" ? signature : serializeSignature(signature);

const consumeCallValue = (state: BundleValueState, call: BundlerCall): BundleValueState => {
  if (call.value > state.availableBundlerValue) {
    return {
      value: state.value + call.value - state.availableBundlerValue,
      availableBundlerValue: 0n,
    };
  }

  return {
    value: state.value,
    availableBundlerValue: state.availableBundlerValue - call.value,
  };
};

export namespace BundlerAction {
  /**
   * Encodes a list of supported Bundler3 actions into a single `multicall` transaction,
   * deriving `tx.value` from the encoded value-carrying calls.
   */
  export function encodeBundle(chainId: ChainId, actions: Action[]) {
    const {
      bundler3: { bundler3 },
    } = getChainAddresses(chainId);

    let valueState: BundleValueState = {
      value: 0n,
      availableBundlerValue: 0n,
    };
    const encodedActions: BundlerCall[] = [];

    for (const action of actions) {
      const encodedAction = encodeBundleAction({ chainId, action, valueState });
      encodedActions.push(...encodedAction.calls);
      valueState = encodedAction.valueState;
    }

    return {
      to: bundler3,
      value: valueState.value,
      data: encodeFunctionData({
        abi: bundler3Abi,
        functionName: "multicall",
        args: [encodedActions],
      }),
    };
  }

  /**
   * Encodes a single supported Bundler3 action into one or more low-level Bundler3 calls.
   *
   * @throws {BundlerErrors.MissingSignature} when a signature action is unsigned.
   * @throws {BundlerErrors.UnexpectedAction} when the action is unavailable on the chain.
   */
  export function encode(chainId: ChainId, action: Action): BundlerCall[] {
    const { type, args } = action;

    switch (type) {
      case "nativeTransfer": {
        return BundlerAction.nativeTransfer(chainId, ...args);
      }
      case "erc20Transfer": {
        return BundlerAction.erc20Transfer(...args);
      }
      case "erc20TransferFrom": {
        return BundlerAction.erc20TransferFrom(chainId, ...args);
      }
      case "approve2": {
        const [owner, permitSingle, signature, skipRevert] = args;
        if (signature == null) throw new BundlerErrors.MissingSignature();

        return BundlerAction.approve2(chainId, owner, permitSingle, signature, skipRevert);
      }
      case "approve2Iris": {
        const [owner, permitSingle, signature, skipRevert] = args;
        if (signature == null) throw new BundlerErrors.MissingSignature();

        return BundlerAction.approve2Iris(chainId, owner, permitSingle, signature, skipRevert);
      }
      case "transferFrom2": {
        return BundlerAction.transferFrom2(chainId, ...args);
      }
      case "erc4626Deposit": {
        return BundlerAction.erc4626Deposit(chainId, ...args);
      }
      case "erc4626Redeem": {
        return BundlerAction.erc4626Redeem(chainId, ...args);
      }
      case "irisSetAuthorizationWithSig": {
        const [authorization, signature, skipRevert] = args;
        if (signature == null) throw new BundlerErrors.MissingSignature();

        return BundlerAction.irisSetAuthorizationWithSig(
          chainId,
          authorization,
          signature,
          skipRevert,
        );
      }
      case "irisTake": {
        return BundlerAction.irisTake(chainId, ...args);
      }
      case "irisRepay": {
        return BundlerAction.irisRepay(chainId, ...args);
      }
      case "irisSupplyCollateral": {
        return BundlerAction.irisSupplyCollateral(chainId, ...args);
      }
      case "irisWithdrawCollateral": {
        return BundlerAction.irisWithdrawCollateral(chainId, ...args);
      }
      case "irisSupplyBond": {
        return BundlerAction.irisSupplyBond(chainId, ...args);
      }
      case "irisWithdrawBond": {
        return BundlerAction.irisWithdrawBond(chainId, ...args);
      }
      case "irisRefinance": {
        return BundlerAction.irisRefinance(chainId, ...args);
      }
      case "irisEscape": {
        return BundlerAction.irisEscape(chainId, ...args);
      }
      case "irisClaim": {
        return BundlerAction.irisClaim(chainId, ...args);
      }
      case "morphoFlashLoan": {
        const [token, assets, onMorphoFlashLoan, skipRevert] = args;

        return BundlerAction.morphoFlashLoan(
          chainId,
          token,
          assets,
          onMorphoFlashLoan.flatMap(BundlerAction.encode.bind(null, chainId)),
          skipRevert,
        );
      }
      case "wrapNative": {
        return BundlerAction.wrapNative(chainId, ...args);
      }
    }
  }

  function encodeBundleAction({
    chainId,
    action,
    valueState,
  }: EncodeBundleActionParams): EncodeBundleActionResult {
    const {
      bundler3: { bundler3, generalAdapter1 },
    } = getChainAddresses(chainId);
    let nextValueState = valueState;

    if (action.type === "nativeTransfer") {
      const [owner, recipient, amount] = action.args;

      // A transfer into Bundler3 emits no inner call; it pre-funds later
      // value-carrying calls in the same multicall or callback reentry.
      if (
        !isAddressEqual(owner, bundler3) &&
        !isAddressEqual(owner, generalAdapter1) &&
        isAddressEqual(recipient, bundler3)
      ) {
        nextValueState = addBundlerPrefund(nextValueState, amount);
      }
    }

    const calls = BundlerAction.encode(chainId, action);
    for (const call of calls) {
      nextValueState = consumeCallValue(nextValueState, call);
    }

    if (action.type === "morphoFlashLoan") {
      const [, , onMorphoFlashLoan] = action.args;
      for (const callbackAction of onMorphoFlashLoan) {
        const encodedCallback = encodeBundleAction({
          chainId,
          action: callbackAction,
          valueState: nextValueState,
        });
        nextValueState = encodedCallback.valueState;
      }
    }

    return { calls, valueState: nextValueState };
  }

  /**
   * Encodes a native-token transfer. Transfers to Bundler3 are treated as bundle pre-funding and
   * emit no inner call; transfers whose `owner` is GeneralAdapter1 are encoded as
   * `GeneralAdapter1.nativeTransfer` with `skipRevert: false`.
   */
  export function nativeTransfer(
    chainId: ChainId,
    owner: Address,
    recipient: Address,
    amount: bigint,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { bundler3, generalAdapter1 },
    } = getChainAddresses(chainId);

    if (isAddressEqual(recipient, bundler3)) return [];

    if (isAddressEqual(owner, generalAdapter1)) {
      return [
        {
          to: generalAdapter1,
          data: encodeFunctionData({
            abi: generalAdapter1Abi,
            functionName: "nativeTransfer",
            args: [recipient, amount],
          }),
          value: 0n,
          skipRevert: false,
          callbackHash: zeroHash,
        },
      ];
    }

    return [
      {
        to: recipient,
        data: "0x",
        value: amount,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /** Encodes an ERC20 transfer from the given adapter. */
  export function erc20Transfer(
    asset: Address,
    recipient: Address,
    amount: bigint,
    adapter: Address,
    skipRevert = false,
  ): BundlerCall[] {
    return [
      {
        to: adapter,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "erc20Transfer",
          args: [asset, recipient, amount],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /** Encodes a GeneralAdapter1 ERC20 `transferFrom` pulling `amount` of `asset` from the initiator. */
  export function erc20TransferFrom(
    chainId: ChainId,
    asset: Address,
    amount: bigint,
    recipient: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "erc20TransferFrom",
          args: [asset, recipient, amount],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /** Encodes a Permit2 approval for GeneralAdapter1 spending (raw call to the Permit2 contract). */
  export function approve2(
    chainId: ChainId,
    owner: Address,
    permitSingle: Permit2PermitSingle,
    signature: Hex | Signature,
    skipRevert = true,
  ): BundlerCall[] {
    const {
      permit2,
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);
    if (permit2 == null) {
      throw new BundlerErrors.UnexpectedAction("approve2", chainId);
    }

    return [
      {
        to: permit2,
        data: encodeFunctionData({
          abi: permit2Abi,
          functionName: "permit",
          args: [
            owner,
            {
              ...permitSingle,
              spender: generalAdapter1,
            },
            toSignatureHex(signature),
          ],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /** Encodes a Permit2 approval for Iris core spending (solver bond funding). */
  export function approve2Iris(
    chainId: ChainId,
    owner: Address,
    permitSingle: Permit2PermitSingle,
    signature: Hex | Signature,
    skipRevert = true,
  ): BundlerCall[] {
    const { iris, permit2 } = getChainAddresses(chainId);
    if (permit2 == null) {
      throw new BundlerErrors.UnexpectedAction("approve2Iris", chainId);
    }

    return [
      {
        to: permit2,
        data: encodeFunctionData({
          abi: permit2Abi,
          functionName: "permit",
          args: [
            owner,
            {
              ...permitSingle,
              spender: iris,
            },
            toSignatureHex(signature),
          ],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /** Encodes a GeneralAdapter1 Permit2 transfer pulling `amount` of `asset` from the initiator. */
  export function transferFrom2(
    chainId: ChainId,
    asset: Address,
    amount: bigint,
    recipient: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "permit2TransferFrom",
          args: [asset, recipient, amount],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /** Encodes a GeneralAdapter1 ERC4626 deposit. */
  export function erc4626Deposit(
    chainId: ChainId,
    erc4626: Address,
    assets: bigint,
    maxSharePrice: bigint,
    receiver: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "erc4626Deposit",
          args: [erc4626, assets, maxSharePrice, receiver],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /** Encodes a GeneralAdapter1 ERC4626 redeem. */
  export function erc4626Redeem(
    chainId: ChainId,
    erc4626: Address,
    shares: bigint,
    minSharePrice: bigint,
    receiver: Address,
    owner: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "erc4626Redeem",
          args: [erc4626, shares, minSharePrice, receiver, owner],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a raw Iris `setAuthorizationWithSig` call submitting the owner's signed authorization.
   *
   * The call targets the Iris core directly — GeneralAdapter1 has no authorization action, and
   * `setAuthorizationWithSig` is permissionless. `skipRevert` defaults to `true`, matching the
   * convention for already-authorized accounts (the call reverts harmlessly on a used nonce).
   *
   * @throws {BundlerErrors.UnexpectedSignature} when `authorization.authorized` is not the chain's
   *   `GeneralAdapter1` — the only operator this bundled path may grant rights to.
   */
  export function irisSetAuthorizationWithSig(
    chainId: ChainId,
    authorization: Authorization,
    signature: Hex | Signature,
    skipRevert = true,
  ): BundlerCall[] {
    const {
      iris,
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    if (!isAddressEqual(authorization.authorized, generalAdapter1)) {
      throw new BundlerErrors.UnexpectedSignature(authorization.authorized);
    }

    return [
      {
        to: iris,
        data: encodeFunctionData({
          abi: irisAbi,
          functionName: "setAuthorizationWithSig",
          args: [authorization, toSignatureHex(signature)],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /** Encodes a GeneralAdapter1 Iris take opening a loan from the solver-signed quote. */
  export function irisTake(
    chainId: ChainId,
    quote: Quote,
    signature: Hex | Signature,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "irisTake",
          args: [quote, toSignatureHex(signature)],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /** Encodes a GeneralAdapter1 Iris repay for `pod`, pulling the debt `token` from the adapter. */
  export function irisRepay(
    chainId: ChainId,
    pod: Address,
    token: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "irisRepay",
          args: [pod, token],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /** Encodes a GeneralAdapter1 Iris supply-collateral for `pod`. */
  export function irisSupplyCollateral(
    chainId: ChainId,
    pod: Address,
    token: Address,
    amount: bigint,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "irisSupplyCollateral",
          args: [pod, token, amount],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /** Encodes a GeneralAdapter1 Iris withdraw-collateral for `pod` (initiator must be the borrower). */
  export function irisWithdrawCollateral(
    chainId: ChainId,
    pod: Address,
    amount: bigint,
    receiver: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "irisWithdrawCollateral",
          args: [pod, amount, receiver],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /** Encodes a GeneralAdapter1 Iris supply-bond for `pod`. */
  export function irisSupplyBond(
    chainId: ChainId,
    pod: Address,
    token: Address,
    amount: bigint,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "irisSupplyBond",
          args: [pod, token, amount],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /** Encodes a GeneralAdapter1 Iris withdraw-bond for `pod` (initiator must be the solver). */
  export function irisWithdrawBond(
    chainId: ChainId,
    pod: Address,
    amount: bigint,
    receiver: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "irisWithdrawBond",
          args: [pod, amount, receiver],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /** Encodes a GeneralAdapter1 Iris refinance moving `pod` to `newVenueId` (initiator must be the solver). */
  export function irisRefinance(
    chainId: ChainId,
    pod: Address,
    receiver: Address,
    newVenueId: bigint,
    data: Hex,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "irisRefinance",
          args: [pod, receiver, newVenueId, data],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /** Encodes a GeneralAdapter1 Iris escape exiting the resolved loan of `pod` (initiator must be the borrower). */
  export function irisEscape(
    chainId: ChainId,
    pod: Address,
    receiver: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "irisEscape",
          args: [pod, receiver],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /** Encodes a GeneralAdapter1 Iris claim of tokens accrued to the initiator. */
  export function irisClaim(
    chainId: ChainId,
    token: Address,
    amount: bigint,
    receiver: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "irisClaim",
          args: [token, amount, receiver],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /** Encodes a GeneralAdapter1 Morpho flash loan executing `callbackCalls` inside the callback reentry. */
  export function morphoFlashLoan(
    chainId: ChainId,
    token: Address,
    assets: bigint,
    callbackCalls: BundlerCall[],
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    const { callbackHash, reenterData } = encodeCallbackCalls(callbackCalls);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "morphoFlashLoan",
          args: [token, assets, reenterData],
        }),
        value: 0n,
        skipRevert,
        callbackHash,
      },
    ];
  }

  /** Encodes a GeneralAdapter1 native wrap of `amount` to `recipient`. */
  export function wrapNative(
    chainId: ChainId,
    amount: bigint,
    recipient: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "wrapNative",
          args: [amount, recipient],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }
}
