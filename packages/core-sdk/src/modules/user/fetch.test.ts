import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { createMockClient, expectReadCall, mockRead } from "@iris-credit/test/mock";
import { USER } from "../../../test/fixtures/iris.js";
import { irisAbi } from "../../abis/iris.js";
import { getChainAddresses } from "../../addresses.js";
import { ChainId } from "../../chain.js";
import { UnsupportedChainIdError } from "../../errors.js";
import { fetchUser } from "./fetch.js";
import { User } from "./User.js";

const { iris, bundler3 } = getChainAddresses(ChainId.EthMainnet);

const mockUserClient = (isAuthorized: boolean) => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: iris,
    abi: irisAbi,
    functionName: "isAuthorized",
    result: isAuthorized,
  });

  return handle;
};

describe("fetchUser", () => {
  test("default", async () => {
    const { client } = mockUserClient(true);

    expect(await fetchUser(USER, client)).toStrictEqual(
      new User({ address: USER, isBundlerAuthorized: true }),
    );
  });

  test("behavior: reports an unauthorized user", async () => {
    const { client } = mockUserClient(false);

    expect((await fetchUser(USER, client)).isBundlerAuthorized).toBe(false);
  });

  test("behavior: queries the authorization granted to the general adapter", async () => {
    const handle = mockUserClient(true);

    await fetchUser(USER, handle.client);

    expect(
      expectReadCall(handle, { address: iris, abi: irisAbi, functionName: "isAuthorized" }),
    ).toStrictEqual([{ functionName: "isAuthorized", args: [USER, bundler3.generalAdapter1] }]);
  });

  test("behavior: skips the chain id read when supplied", async () => {
    const handle = mockUserClient(true);

    await fetchUser(USER, handle.client, { chainId: ChainId.EthMainnet });

    expect(handle.request.mock.calls.map(([call]) => call.method)).not.toContain("eth_chainId");
  });

  test("error: UnsupportedChainIdError", async () => {
    const { client } = mockUserClient(true);

    await expect(fetchUser(USER, client, { chainId: 999 as ChainId })).rejects.toBeInstanceOf(
      UnsupportedChainIdError,
    );
  });
});
