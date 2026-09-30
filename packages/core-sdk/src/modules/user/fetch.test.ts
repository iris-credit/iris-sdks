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

const mockUserClient = (isAuthorized: boolean, nonce = 0n) => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: iris,
    abi: irisAbi,
    functionName: "isAuthorized",
    result: isAuthorized,
  });
  mockRead(handle, {
    address: iris,
    abi: irisAbi,
    functionName: "nonce",
    result: nonce,
  });

  return handle;
};

describe("fetchUser", () => {
  test("default", async () => {
    const { client } = mockUserClient(true, 2n);

    expect(await fetchUser(USER, client)).toStrictEqual(
      new User({ address: USER, isBundlerAuthorized: true, nonce: 2n }),
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

  test("behavior: queries the user's authorization nonce", async () => {
    const handle = mockUserClient(true);

    await fetchUser(USER, handle.client);

    expect(
      expectReadCall(handle, { address: iris, abi: irisAbi, functionName: "nonce" }),
    ).toStrictEqual([{ functionName: "nonce", args: [USER] }]);
  });

  test("behavior: skips the chain id read when supplied", async () => {
    const handle = mockUserClient(true);

    await fetchUser(USER, handle.client, { chainId: ChainId.EthMainnet });

    expect(handle.request.mock.calls.map(([call]) => call.method)).not.toContain("eth_chainId");
  });

  test("behavior: leaves caller-owned parameters untouched", async () => {
    const { client } = mockUserClient(true);
    const parameters = {};

    await fetchUser(USER, client, parameters);

    expect(parameters).toStrictEqual({});
  });

  test("error: UnsupportedChainIdError", async () => {
    const { client } = mockUserClient(true);

    await expect(fetchUser(USER, client, { chainId: 999 as ChainId })).rejects.toBeInstanceOf(
      UnsupportedChainIdError,
    );
  });
});
