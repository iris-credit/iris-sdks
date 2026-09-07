import { describe, expect, test } from "vitest";
import {
  ExpiredDeadlineError,
  InputExceedsMaxError,
  NegativeInputError,
  NonPositiveInputError,
} from "./errors.js";

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

describe("InputExceedsMaxError", () => {
  test("default", () => {
    const error = new InputExceedsMaxError({ field: "deadline", value: 3n, max: 2n });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(InputExceedsMaxError);
    expect(error.message).toBe('Input "deadline" must be at most "2", got "3".');
  });
});

describe("ExpiredDeadlineError", () => {
  test("default", () => {
    const error = new ExpiredDeadlineError(1n, 2n);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ExpiredDeadlineError);
    expect(error.message).toBe(
      'Deadline "1" has expired at timestamp "2". Choose a future deadline and rebuild the operation.',
    );
  });
});
