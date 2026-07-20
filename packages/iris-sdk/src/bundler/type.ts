import type { Address, Hex } from "viem";
import type { Authorization, PermitSingle, Quote } from "@iris-credit/core-sdk";

/**
 * Permit2 single-permit payload accepted by the `approve2` action, without a
 * `spender`: the encoder always injects GeneralAdapter1 or Iris so a signature can
 * never approve an arbitrary spender.
 */
export type Permit2PermitSingle = Omit<PermitSingle, "spender">;

/**
 * Argument tuples for Bundler3 actions supported by `iris-sdk`.
 */
export interface ActionArgs {
  /** Native-token transfer from `owner` to `recipient` for `amount`; `skipRevert` controls Bundler3 revert handling. */
  readonly nativeTransfer: [
    owner: Address,
    recipient: Address,
    amount: bigint,
    skipRevert?: boolean,
  ];

  /** ERC20 transfer from `adapter` to `recipient` for `amount` of `asset`; `skipRevert` controls Bundler3 revert handling. */
  readonly erc20Transfer: [
    asset: Address,
    recipient: Address,
    amount: bigint,
    adapter: Address,
    skipRevert?: boolean,
  ];

  /** GeneralAdapter1 ERC20 `transferFrom` of `asset` and `amount` to `recipient`; `skipRevert` controls Bundler3 revert handling. */
  readonly erc20TransferFrom: [
    asset: Address,
    amount: bigint,
    recipient: Address,
    skipRevert?: boolean,
  ];

  /**
   * Permit2 approval from `owner` for `permitSingle` and `signature`; `skipRevert` controls Bundler3 revert handling.
   * Spender is fixed to GeneralAdapter1.
   */
  readonly approve2: [
    owner: Address,
    permitSingle: Permit2PermitSingle,
    signature: Hex | null,
    skipRevert?: boolean,
  ];

  /**
   * Permit2 approval from `owner` for `permitSingle` and `signature`; `skipRevert` controls Bundler3 revert handling.
   * Spender is fixed to Iris. Used for solver bond funding.
   */
  readonly approve2Iris: [
    owner: Address,
    permitSingle: Permit2PermitSingle,
    signature: Hex | null,
    skipRevert?: boolean,
  ];

  /** GeneralAdapter1 Permit2 transfer of `asset` and `amount` to `recipient`; `skipRevert` controls Bundler3 revert handling. */
  readonly transferFrom2: [
    asset: Address,
    amount: bigint,
    recipient: Address,
    skipRevert?: boolean,
  ];

  /** ERC4626 deposit into `erc4626` for `assets`, `maxSharePrice`, and `receiver`; `skipRevert` controls Bundler3 revert handling. */
  readonly erc4626Deposit: [
    erc4626: Address,
    assets: bigint,
    maxSharePrice: bigint,
    receiver: Address,
    skipRevert?: boolean,
  ];

  /** ERC4626 redeem from `erc4626` for `shares`, `minSharePrice`, `receiver`, and `owner`; `skipRevert` controls Bundler3 revert handling. */
  readonly erc4626Redeem: [
    erc4626: Address,
    shares: bigint,
    minSharePrice: bigint,
    receiver: Address,
    owner: Address,
    skipRevert?: boolean,
  ];

  /** Iris `setAuthorizationWithSig` call submitting a signed `authorization` and its `signature`; `skipRevert` controls Bundler3 revert handling. */
  readonly irisSetAuthorizationWithSig: [
    authorization: Authorization,
    signature: Hex | null,
    skipRevert?: boolean,
  ];

  /** Iris take call opening a loan from the solver-signed `quote` and `signature`; `skipRevert` controls Bundler3 revert handling. */
  readonly irisTake: [quote: Quote, signature: Hex, skipRevert?: boolean];

  /** Iris repay call for `pod`, pulling the loan's debt `token` from the adapter; `skipRevert` controls Bundler3 revert handling. */
  readonly irisRepay: [pod: Address, token: Address, skipRevert?: boolean];

  /** Iris supply-collateral call for `pod`, `token`, and `amount`; `skipRevert` controls Bundler3 revert handling. */
  readonly irisSupplyCollateral: [
    pod: Address,
    token: Address,
    amount: bigint,
    skipRevert?: boolean,
  ];

  /** Iris withdraw-collateral call for `pod`, `amount`, and `receiver`, requiring the initiator to be the loan's borrower; `skipRevert` controls Bundler3 revert handling. */
  readonly irisWithdrawCollateral: [
    pod: Address,
    amount: bigint,
    receiver: Address,
    skipRevert?: boolean,
  ];

  /** Iris supply-bond call for `pod`, `token`, and `amount`; `skipRevert` controls Bundler3 revert handling. */
  readonly irisSupplyBond: [pod: Address, token: Address, amount: bigint, skipRevert?: boolean];

  /** Iris withdraw-bond call for `pod`, `amount`, and `receiver`, requiring the initiator to be the loan's solver; `skipRevert` controls Bundler3 revert handling. */
  readonly irisWithdrawBond: [
    pod: Address,
    amount: bigint,
    receiver: Address,
    skipRevert?: boolean,
  ];

  /** Iris refinance call moving `pod` to `newVenueId` with market `data`, sending borrow proceeds to `receiver`, requiring the initiator to be the loan's solver; `skipRevert` controls Bundler3 revert handling. */
  readonly irisRefinance: [
    pod: Address,
    receiver: Address,
    newVenueId: bigint,
    data: Hex,
    skipRevert?: boolean,
  ];

  /** Iris escape call exiting the resolved loan of `pod` to `receiver`, requiring the initiator to be the loan's borrower; `skipRevert` controls Bundler3 revert handling. */
  readonly irisEscape: [pod: Address, receiver: Address, skipRevert?: boolean];

  /** Iris claim call for `amount` of `token` accrued to the initiator, sent to `receiver`; `skipRevert` controls Bundler3 revert handling. */
  readonly irisClaim: [token: Address, amount: bigint, receiver: Address, skipRevert?: boolean];

  /** Morpho flash loan of `assets` of `token`, executing callback actions inside `onMorphoFlashLoan`. */
  readonly morphoFlashLoan: [
    token: Address,
    assets: bigint,
    onMorphoFlashLoan: Action[],
    skipRevert?: boolean,
  ];

  /** GeneralAdapter1 native wrap of `amount` to `recipient`; `skipRevert` controls Bundler3 revert handling. */
  readonly wrapNative: [amount: bigint, recipient: Address, skipRevert?: boolean];
}

/**
 * Supported Bundler3 action discriminator.
 */
export type ActionType = keyof ActionArgs;

/**
 * Supported Bundler3 action object map keyed by action discriminator.
 */
export type Actions = {
  readonly [T in ActionType]: {
    readonly type: T;
    readonly args: ActionArgs[T];
  };
};

/**
 * Discriminated union of Bundler3 actions supported by `iris-sdk`.
 */
export type Action = Actions[ActionType];
