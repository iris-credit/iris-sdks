import { describe, expect, test } from "vitest";
import { fetchBlm } from "../modules/blm/fetch.js";
import { fetchConfig } from "../modules/config/fetch.js";
import { fetchHolding } from "../modules/holding/fetch.js";
import { fetchLoan } from "../modules/loan/fetch.js";
import { fetchAccrualPosition, fetchPosition } from "../modules/position/fetch.js";
import { fetchToken } from "../modules/token/fetch.js";
import { fetchUser } from "../modules/user/fetch.js";
import { fetchVenue } from "../modules/venue/fetch.js";
// Importing this barrel triggers the static augmentation of every core-sdk class.
import {
  AccrualPosition,
  Blm,
  Config,
  Holding,
  Loan,
  Position,
  Token,
  User,
  Venue,
} from "./index.js";

describe("core-sdk augmentations", () => {
  // Identity assertions (`.toBe(...)`) so a regression that wired the static
  // method to a different function (or a no-op stub) is caught — a
  // `typeof X.fetch === "function"` check would not.
  //
  // Each row runs as its own test so a single broken wiring does not mask
  // failures on the rest.
  interface Wiring {
    label: string;
    get: () => unknown;
    expected: unknown;
  }
  const wirings: ReadonlyArray<Wiring> = [
    { label: "Blm.fetch", get: () => Blm.fetch, expected: fetchBlm },
    { label: "Config.fetch", get: () => Config.fetch, expected: fetchConfig },
    { label: "Holding.fetch", get: () => Holding.fetch, expected: fetchHolding },
    { label: "Loan.fetch", get: () => Loan.fetch, expected: fetchLoan },
    { label: "Position.fetch", get: () => Position.fetch, expected: fetchPosition },
    {
      label: "AccrualPosition.fetch",
      get: () => AccrualPosition.fetch,
      expected: fetchAccrualPosition,
    },
    { label: "Token.fetch", get: () => Token.fetch, expected: fetchToken },
    { label: "User.fetch", get: () => User.fetch, expected: fetchUser },
    { label: "Venue.fetch", get: () => Venue.fetch, expected: fetchVenue },
  ];

  test.each(wirings)("$label is wired to its fetch function", ({ get, expected }) => {
    expect(get()).toBe(expected);
  });

  test("augmented classes are the same objects as the unaugmented exports", async () => {
    // The barrel re-exports the very classes it patches; a duplicate class
    // identity would leave `new Loan(...)` unaugmented for barrel consumers.
    const modules = await import("../index.js");

    expect(Loan).toBe(modules.Loan);
    expect(Position).toBe(modules.Position);
    expect(AccrualPosition).toBe(modules.AccrualPosition);
    expect(Venue).toBe(modules.Venue);
  });
});
