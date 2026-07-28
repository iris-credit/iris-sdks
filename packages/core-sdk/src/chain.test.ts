import { describe, expect, test } from "vitest";
import { entries } from "@iris-credit/iris-ts";
import { ChainId, ChainUtils } from "./chain.js";

describe("CHAIN_METADATA", () => {
  test("should key every entry by its own chain id", () => {
    for (const [chainId, { id }] of entries(ChainUtils.CHAIN_METADATA)) {
      expect(+chainId).toBe(id);
    }
  });

  test("should describe every supported chain", () => {
    for (const chainId of ChainUtils.supportedChainIds) {
      expect(ChainUtils.CHAIN_METADATA[chainId]).toBeDefined();
    }
  });
});

describe("toHexChainId", () => {
  test("should convert decimal chain ids", () => {
    expect(ChainUtils.toHexChainId(ChainId.EthMainnet)).toBe("0x1");
    expect(ChainUtils.toHexChainId(ChainId.VNet)).toBe("0x2707");
  });
});

describe("explorer URL helpers", () => {
  test("should return the chain explorer", () => {
    expect(ChainUtils.getExplorerUrl(ChainId.EthMainnet)).toBe("https://etherscan.io");
  });

  test("should append the address path", () => {
    expect(
      ChainUtils.getExplorerAddressUrl(
        ChainId.EthMainnet,
        "0x0000000000000000000000000000000000000001",
      ),
    ).toBe("https://etherscan.io/address/0x0000000000000000000000000000000000000001");
  });

  test("should append the transaction path", () => {
    expect(ChainUtils.getExplorerTransactionUrl(ChainId.EthMainnet, "0xabc")).toBe(
      "https://etherscan.io/tx/0xabc",
    );
  });
});

describe("isSupportedChainId", () => {
  test("should accept every supported chain id and reject anything else", () => {
    for (const id of ChainUtils.supportedChainIds) {
      expect(ChainUtils.isSupportedChainId(id)).toBe(true);
    }

    expect(ChainUtils.isSupportedChainId(0)).toBe(false);
    expect(ChainUtils.isSupportedChainId(999)).toBe(false);
    expect(ChainUtils.isSupportedChainId(-1)).toBe(false);
    expect(ChainUtils.isSupportedChainId(1.5)).toBe(false);
    expect(ChainUtils.isSupportedChainId(Number.NaN)).toBe(false);
  });
});
