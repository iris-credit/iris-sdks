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

  constructor({
    address,
    isBundlerAuthorized,
  }: {
    address: Address;
    isBundlerAuthorized: boolean;
  }) {
    this.address = address;
    this.isBundlerAuthorized = isBundlerAuthorized;
  }
}
