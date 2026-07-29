import { describe, expect, test } from "vitest";
import { NegativeInputError, NonPositiveInputError } from "./errors.js";

describe("NegativeInputError", () => {
  test("default", () => {
    const error = new NegativeInputError("nativeAmount", -1n);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(NegativeInputError);
    expect(error.message).toBe('Input "nativeAmount" must be non-negative, got "-1".');
  });
});

describe("NonPositiveInputError", () => {
  test("default", () => {
    const error = new NonPositiveInputError("collateral", 0n);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(NonPositiveInputError);
    expect(error.message).toBe('Input "collateral" must be positive, got "0".');
  });
});
