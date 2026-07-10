import type { Address, Hex } from "viem";

export interface BaseAction<
  TType extends string = string,
  TArgs extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly type: TType;
  readonly args: TArgs;
}

export interface ERC20ApprovalAction extends BaseAction<
  "erc20Approval",
  { spender: Address; amount: bigint }
> {}

// TODO:
export interface IrisTakeAction extends BaseAction<"irisTake", {}> {}

export type TransactionAction = ERC20ApprovalAction | IrisTakeAction;

export interface Transaction<TAction extends BaseAction = TransactionAction> {
  readonly to: Address;
  readonly value: bigint;
  readonly data: Hex;
  readonly action: TAction;
}
