import type { Address } from "viem";
import type { ChainAddresses } from "../../addresses.js";
import type { BigIntish } from "../../types.js";

import { entries, fromEntries } from "@iris-credit/iris-ts";

/** Address registry labels that may receive ERC-20 allowances from a user. */
export const ERC20_ALLOWANCE_RECIPIENTS = [
  "iris",
  "permit2",
  // TODO:
  //   "bundler3.generalAdapter1",
] as const satisfies readonly (keyof ChainAddresses)[];

/** Address registry label that may receive an ERC-20 allowance from a user. */
export type Erc20AllowanceRecipient = (typeof ERC20_ALLOWANCE_RECIPIENTS)[number];

/** Normalized Permit2 allowance values. */
export interface Permit2Allowance {
  amount: bigint;
  expiration: bigint;
  nonce: bigint;
}

/** Input shape for Permit2 allowance values before bigint normalization. */
export interface IPermit2Allowance {
  amount: BigIntish;
  expiration: BigIntish;
  nonce: BigIntish;
}

/** Input shape for a user's token holding and allowance state. */
export interface IHolding {
  user: Address;
  token: Address;
  balance: bigint;
  erc20Allowances: {
    [key in Erc20AllowanceRecipient]: bigint;
  };
  permit2IrisAllowance: IPermit2Allowance;
  permit2BundlerAllowance: IPermit2Allowance;
}

/** Represents a user's balance and allowance state for one token. */
export class Holding implements IHolding {
  /**
   * The user of this holding.
   */
  public readonly user: Address;

  /**
   * The token in which this holding is denominated.
   */
  public readonly token: Address;

  /**
   * The balance of the user for this token.
   */
  public readonly balance: bigint;

  /**
   * ERC20 allowance for this token from the user to the allowance recipient.
   */
  public readonly erc20Allowances: {
    [key in Erc20AllowanceRecipient]: bigint;
  };

  /**
   * Permit2 allowance for this token from the user to the allowance recipient.
   */
  public readonly permit2IrisAllowance: Permit2Allowance;

  /**
   * Permit2 allowance for this token from the user to the allowance recipient.
   */
  public readonly permit2BundlerAllowance: Permit2Allowance;

  constructor(params: IHolding) {
    this.user = params.user;
    this.token = params.token;
    this.balance = params.balance;
    this.erc20Allowances = fromEntries(
      entries(params.erc20Allowances).map(([address, allowance]) => [address, allowance]),
    );
    this.permit2IrisAllowance = {
      amount: BigInt(params.permit2IrisAllowance.amount),
      expiration: BigInt(params.permit2IrisAllowance.expiration),
      nonce: BigInt(params.permit2IrisAllowance.nonce),
    };
    this.permit2BundlerAllowance = {
      amount: BigInt(params.permit2BundlerAllowance.amount),
      expiration: BigInt(params.permit2BundlerAllowance.expiration),
      nonce: BigInt(params.permit2BundlerAllowance.nonce),
    };
  }
}
