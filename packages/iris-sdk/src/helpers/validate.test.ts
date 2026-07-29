import { describe, expect, test } from "vitest";
import { ChainId, getChainAddresses } from "@iris-credit/core-sdk";
import { CHAIN_ID, USER_A, USER_B } from "../../test/fixtures/iris.js";
import {
  AddressMismatchError,
  ChainIdMismatchError,
  MissingClientPropertyError,
  NativeAmountOnNonWNativeAssetError,
} from "../types/index.js";
import { validateChainId, validateNativeAsset, validateUserAddress } from "./validate.js";

// ---------------------------------------------------------------------------
// validateUserAddress
// ---------------------------------------------------------------------------

describe("validateUserAddress", () => {
  test("should pass when addresses match", () => {
    expect(() => validateUserAddress(USER_A, USER_A)).not.toThrow();
  });

  test("should throw MissingClientPropertyError when clientAccountAddress is undefined", () => {
    expect(() => validateUserAddress(undefined, USER_A)).toThrow(MissingClientPropertyError);
    expect(() => validateUserAddress(undefined, USER_A)).toThrow(/account/);
  });

  test("should throw AddressMismatchError when addresses differ", () => {
    expect(() => validateUserAddress(USER_A, USER_B)).toThrow(AddressMismatchError);
  });
});

// ---------------------------------------------------------------------------
// validateChainId
// ---------------------------------------------------------------------------

describe("validateChainId", () => {
  test("should pass when chain IDs match", () => {
    expect(() => validateChainId(CHAIN_ID, CHAIN_ID)).not.toThrow();
  });

  test("should throw ChainIdMismatchError when chain IDs differ", () => {
    expect(() => validateChainId(ChainId.VNet, CHAIN_ID)).toThrow(ChainIdMismatchError);
  });

  test("should throw ChainIdMismatchError when client chain ID is undefined", () => {
    expect(() => validateChainId(undefined, CHAIN_ID)).toThrow(ChainIdMismatchError);
  });
});

// ---------------------------------------------------------------------------
// validateNativeAsset
// ---------------------------------------------------------------------------

describe("validateNativeAsset", () => {
  const { wNative, tokens } = getChainAddresses(CHAIN_ID);

  test("should pass when asset is wNative", () => {
    expect(() => validateNativeAsset(CHAIN_ID, wNative)).not.toThrow();
  });

  test("should pass when the asset matches wNative in a different case", () => {
    expect(() =>
      validateNativeAsset(CHAIN_ID, wNative.toLowerCase() as typeof wNative),
    ).not.toThrow();
  });

  test("should throw NativeAmountOnNonWNativeAssetError when asset is not wNative", () => {
    expect(() => validateNativeAsset(CHAIN_ID, tokens.USDC)).toThrow(
      NativeAmountOnNonWNativeAssetError,
    );
  });
});
