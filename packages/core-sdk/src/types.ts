/** The id of a market used on the core contract */
export type MarketId = `0x${string}` & { readonly __TYPE__: "marketId" };

export type BigIntish = bigint | string | number | boolean;

export type Loadable<T> = T | undefined;
export type Failable<T> = T | null;
export type Fetchable<T> = Failable<Loadable<T>>;

export const isMarketId = (value: unknown): value is MarketId => {
  return typeof value === "string" && /^0x[0-9A-Fa-f]{64}$/.test(value);
};
