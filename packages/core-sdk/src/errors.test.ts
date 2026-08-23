import { describe, expect, test } from "vitest";
import { EMPTY_HEX, POD, USER } from "../test/fixtures/iris.js";
import { ChainId } from "./chain.js";
import { IrisCoreErrors, UnsupportedChainIdError, UnsupportedVenueAdapterError } from "./errors.js";

describe("error classes", () => {
  test("UnsupportedChainIdError preserves chainId", () => {
    const err = new UnsupportedChainIdError(999);

    expect(err).toBeInstanceOf(Error);
    expect(err.chainId).toBe(999);
    expect(err.message).toContain("999");
  });

  test("UnsupportedVenueAdapterError preserves adapter and chainId", () => {
    const err = new UnsupportedVenueAdapterError(USER, ChainId.EthMainnet);

    expect(err).toBeInstanceOf(Error);
    expect(err.adapter).toBe(USER);
    expect(err.chainId).toBe(ChainId.EthMainnet);
    expect(err.message).toContain(USER);
  });
});

describe("IrisCoreErrors namespace", () => {
  test("InvalidInterestAccrual preserves timestamp and lastUpdate", () => {
    const err = new IrisCoreErrors.InvalidInterestAccrual(100n, 200n);

    expect(err.timestamp).toBe(100n);
    expect(err.lastUpdate).toBe(200n);
    expect(err.message).toContain("200");
  });

  test("InvalidVenueInterestAccrual preserves kind, timestamp and lastUpdate", () => {
    const err = new IrisCoreErrors.InvalidVenueInterestAccrual("collateral", 100n, 200n);

    expect(err.kind).toBe("collateral");
    expect(err.timestamp).toBe(100n);
    expect(err.lastUpdate).toBe(200n);
    expect(err.message).toContain("collateral");
  });

  test("InvalidVenueIndex preserves kind, index and lastIndex", () => {
    const err = new IrisCoreErrors.InvalidVenueIndex("debt", 1n, 2n);

    expect(err.kind).toBe("debt");
    expect(err.index).toBe(1n);
    expect(err.lastIndex).toBe(2n);
    expect(err.message).toContain("debt");
  });

  test("UnexpectedPod preserves the expected and actual pods", () => {
    const err = new IrisCoreErrors.UnexpectedPod(POD, USER);

    expect(err.expected).toBe(POD);
    expect(err.actual).toBe(USER);
    expect(err.message).toContain(POD);
    expect(err.message).toContain(USER);
  });

  test("UnexpectedVenue preserves both ids and both data", () => {
    const err = new IrisCoreErrors.UnexpectedVenue(1n, 2n, EMPTY_HEX, "0xff");

    expect(err.expectedId).toBe(1n);
    expect(err.actualId).toBe(2n);
    expect(err.expectedData).toBe(EMPTY_HEX);
    expect(err.actualData).toBe("0xff");
    expect(err.message).toContain("0xff");
  });

  test.each([
    ["HealthyLoan", IrisCoreErrors.HealthyLoan],
    ["HealthyBond", IrisCoreErrors.HealthyBond],
    ["InsufficientCollateral", IrisCoreErrors.InsufficientCollateral],
    ["InsufficientBond", IrisCoreErrors.InsufficientBond],
    ["LoanResolved", IrisCoreErrors.LoanResolved],
    ["LiquidatableLoan", IrisCoreErrors.LiquidatableLoan],
  ])("%s preserves pod", (_name, Ctor) => {
    const err = new Ctor(POD);

    expect(err).toBeInstanceOf(Error);
    expect(err.pod).toBe(POD);
    expect(err.message).toContain(POD);
  });

  test.each([
    ["UnknownVenuePrice", IrisCoreErrors.UnknownVenuePrice],
    ["InsufficientVenueCollateral", IrisCoreErrors.InsufficientVenueCollateral],
    ["InsufficientVenuePosition", IrisCoreErrors.InsufficientVenuePosition],
    ["InsufficientVenueLiquidity", IrisCoreErrors.InsufficientVenueLiquidity],
    ["NotAllowedVenue", IrisCoreErrors.NotAllowedVenue],
  ])("%s preserves pod and venueId", (_name, Ctor) => {
    const err = new Ctor(POD, 3n);

    expect(err).toBeInstanceOf(Error);
    expect(err.pod).toBe(POD);
    expect(err.venueId).toBe(3n);
    expect(err.message).toContain(POD);
    expect(err.message).toContain("3");
  });
});
