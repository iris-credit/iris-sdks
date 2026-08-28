import { isHex, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect } from "vitest";
import { getQuoteTypedData } from "@iris-credit/core-sdk";
import { signQuote } from "../../../src/actions/solver/signQuote.js";
import {
  AddressMismatchError,
  ChainIdMismatchError,
  InvalidSignatureError,
} from "../../../src/types/index.js";
import { CHAIN_ID, UNSUPPORTED_CHAIN_ID } from "../../fixtures/iris.js";
import { quote as buildQuote } from "../../helpers/iris.js";
import { test } from "../../setup.js";

describe("signQuote", () => {
  test("default: signs a quote that verifies against the solver", async ({ client }) => {
    const quote = buildQuote({ solver: client.account.address });

    const signature = await signQuote(client, { chainId: CHAIN_ID, quote });

    expect(isHex(signature)).toBe(true);
    expect(signature.length).toBe(132);

    await expect(
      verifyTypedData({
        ...getQuoteTypedData(CHAIN_ID, quote),
        address: client.account.address,
        signature,
      }),
    ).resolves.toBe(true);
  });

  test("behavior: signs the quote verbatim, so a changed field breaks verification", async ({
    client,
  }) => {
    const quote = buildQuote({ solver: client.account.address });

    const signature = await signQuote(client, { chainId: CHAIN_ID, quote });

    await expect(
      verifyTypedData({
        ...getQuoteTypedData(CHAIN_ID, { ...quote, debt: quote.debt + 1n }),
        address: client.account.address,
        signature,
      }),
    ).resolves.toBe(false);
  });

  test("error: ChainIdMismatchError", async ({ client }) => {
    await expect(
      signQuote(client, {
        chainId: UNSUPPORTED_CHAIN_ID,
        quote: buildQuote({ solver: client.account.address }),
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });

  test("error: AddressMismatchError when the account is not the quote's solver", async ({
    client,
  }) => {
    await expect(
      signQuote(client, { chainId: CHAIN_ID, quote: buildQuote() }),
    ).rejects.toBeInstanceOf(AddressMismatchError);
  });

  test("error: InvalidSignatureError", async ({ client }) => {
    const wrongSigner = privateKeyToAccount(
      "0x0000000000000000000000000000000000000000000000000000000000000002",
    );
    const invalidSignatureClient = {
      ...client,
      account: { ...wrongSigner, address: client.account.address },
    };

    await expect(
      signQuote(invalidSignatureClient, {
        chainId: CHAIN_ID,
        quote: buildQuote({ solver: client.account.address }),
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });
});
