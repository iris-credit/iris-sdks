import { describe, expect, it } from "vitest";
import { spawnAnvil } from "../src/anvil.js";

describe("anvil", () => {
  it("should spawn and stop anvil", { timeout: 15_000 }, async () => {
    const { rpcUrl, stop } = await spawnAnvil({ port: 0 });

    expect(rpcUrl).toMatch(/^http:\/\/localhost:\d+$/);

    const stopped = stop();
    expect(stopped).toBe(true);
  });
});
