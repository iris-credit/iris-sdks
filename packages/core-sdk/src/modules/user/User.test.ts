import type { Address } from "viem";

import { describe, expect, test } from "vitest";
import { User } from "./User.js";

const ADDR: Address = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";

describe("User", () => {
  test("stores all fields", () => {
    const user = new User({
      address: ADDR,
      isBundlerAuthorized: true,
    });

    expect(user.address).toBe(ADDR);
    expect(user.isBundlerAuthorized).toBe(true);
  });
});
