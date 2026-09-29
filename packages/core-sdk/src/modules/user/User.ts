import type { Address } from "viem";

export class User {
  /**
   * The user's address.
   */
  public readonly address: Address;

  /**
   * Whether the bundler is authorized to manage the user's position on Iris.
   */
  public isBundlerAuthorized: boolean;

  /**
   * The user's next Iris authorization nonce.
   */
  public nonce: bigint;

  constructor({
    address,
    isBundlerAuthorized,
    nonce,
  }: {
    address: Address;
    isBundlerAuthorized: boolean;
    nonce: bigint;
  }) {
    this.address = address;
    this.isBundlerAuthorized = isBundlerAuthorized;
    this.nonce = nonce;
  }
}
