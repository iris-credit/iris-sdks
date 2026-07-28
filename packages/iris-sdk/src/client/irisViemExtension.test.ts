import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { CHAIN_ID } from "../../test/fixtures/iris.js";
import { irisViemExtension } from "./irisViemExtension.js";

const publicClient = () =>
  createPublicClient({
    chain: mainnet,
    transport: http("http://localhost"),
  });

describe("irisViemExtension", () => {
  test("default", () => {
    const client = publicClient().extend(irisViemExtension());

    expect(client.iris).toBeDefined();
    expect(client.iris.viemClient).toBeDefined();
    expect(typeof client.iris.core).toBe("function");
  });

  test("behavior: the factory returns an entity bound to the same client", () => {
    const client = publicClient().extend(irisViemExtension());

    const core = client.iris.core(CHAIN_ID);

    expect(client.iris.viemClient.chain?.id).toBe(mainnet.id);
    expect(core.getLoanData).toBeDefined();
    expect(core.getPositionData).toBeDefined();
    expect(core.take).toBeDefined();
  });

  test("behavior: options default supportSignature to false", () => {
    const client = publicClient().extend(irisViemExtension());

    expect(client.iris.options.supportSignature).toBe(false);
  });

  test("behavior: forwards options to the iris namespace", () => {
    const client = publicClient().extend(irisViemExtension({ supportSignature: true }));

    expect(client.iris.options.supportSignature).toBe(true);
  });

  test("behavior: the resolved options bag is frozen", () => {
    const client = publicClient().extend(irisViemExtension());

    expect(Object.isFrozen(client.iris.options)).toBe(true);
  });
});
