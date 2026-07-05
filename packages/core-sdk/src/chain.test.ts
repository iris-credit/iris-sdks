import { describe, expect, test } from "vitest";
import { ChainUtils } from "./chain.js";

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
