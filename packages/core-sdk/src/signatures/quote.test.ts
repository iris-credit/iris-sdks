import { describe, expect, test } from "vitest";
import { quoteInput } from "../__test__/fixtures.js";
import { CHAIN_ADDRESSES } from "../addresses.js";
import { ChainId } from "../chain.js";
import { getQuoteTypedData } from "./quote.js";

const { iris } = CHAIN_ADDRESSES[ChainId.EthMainnet];

describe("getQuoteTypedData", () => {
  test("returns the Iris quote typed data", () => {
    const quote = quoteInput();
    const typedData = getQuoteTypedData(ChainId.EthMainnet, quote);

    expect(typedData.domain?.verifyingContract).toBe(iris);
    expect(typedData.message).toEqual(quote);
    expect(typedData.primaryType).toBe("Quote");
  });

  test("scopes the domain to the chain id and the Iris deployment only", () => {
    const typedData = getQuoteTypedData(ChainId.EthMainnet, quoteInput());

    expect(typedData.domain).toEqual({
      chainId: ChainId.EthMainnet,
      verifyingContract: iris,
    });
  });

  test("orders the Quote fields as the contract typehash does", () => {
    const typedData = getQuoteTypedData(ChainId.EthMainnet, quoteInput());

    expect(typedData.types.Quote).toEqual([
      { name: "borrower", type: "address" },
      { name: "solver", type: "address" },
      { name: "receiver", type: "address" },
      { name: "blm", type: "address" },
      { name: "collateralToken", type: "address" },
      { name: "debtToken", type: "address" },
      { name: "collateral", type: "uint256" },
      { name: "debt", type: "uint256" },
      { name: "fixedRate", type: "uint256" },
      { name: "duration", type: "uint256" },
      { name: "overdueRate", type: "uint256" },
      { name: "overduePeriod", type: "uint256" },
      { name: "bond", type: "uint256" },
      { name: "bondLltv", type: "uint256" },
      { name: "venueBitmap", type: "uint256" },
      { name: "venueId", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "data", type: "bytes" },
    ]);
  });

  test("covers every Quote field exactly once", () => {
    const quote = quoteInput();
    const typedData = getQuoteTypedData(ChainId.EthMainnet, quote);
    const names = typedData.types.Quote.map(({ name }) => name);

    expect(names).toEqual([...new Set(names)]);
    expect(names.toSorted()).toEqual(Object.keys(quote).toSorted());
  });

  test("resolves the verifying contract per chain", () => {
    expect(getQuoteTypedData(ChainId.VNet, quoteInput()).domain?.verifyingContract).toBe(
      CHAIN_ADDRESSES[ChainId.VNet].iris,
    );
  });
});
