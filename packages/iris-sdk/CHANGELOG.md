# @iris-credit/iris-sdk

## 0.3.1

### Patch Changes

- Updated dependencies [[`4477595`](https://github.com/iris-credit/iris-sdks/commit/4477595f7ba4ee56632cb3fac08323782e591fa4)]:
  - @iris-credit/core-sdk@0.3.0

## 0.3.0

### Minor Changes

- [#103](https://github.com/iris-credit/iris-sdks/pull/103) [`0d7e728`](https://github.com/iris-credit/iris-sdks/commit/0d7e728e44496b82d6e8d1ac0c018856cc3100e6) Thanks [@u-zzam](https://github.com/u-zzam)! - Add the `close` flow and the `irisClose` action: repay an Iris loan and recover its collateral in one bundle. `Iris.repay` resolves the loan but leaves the collateral on the venue, so the bundle repays first — clearing the bond requirement `Iris.escape` checks — then exits the venue position to the receiver. The exit runs on `escape` rather than `withdrawCollateral` so it takes the venue balance as it stands at execution, instead of an amount a rebase can invalidate. Unlike the permissionless `repay`, `userAddress` must be the loan's borrower: `GeneralAdapter1.irisEscape` pins them as the bundle initiator.

## 0.2.1

### Patch Changes

- [#101](https://github.com/iris-credit/iris-sdks/pull/101) [`ffc47db`](https://github.com/iris-credit/iris-sdks/commit/ffc47dba6ef52f6e72f6f501adcde991e4f49613) Thanks [@u-zzam](https://github.com/u-zzam)! - Include the new venue's `lastUpdate` in the refinance flow's accrual floor: the migration replay accrues the target venue too, so fetching it from a chain whose clock leads the local one by more than the 2h buffer (e.g. a time-warped devnet fork) no longer throws `InvalidInterestAccrual` before the tx is built.

## 0.2.0

### Minor Changes

- [#99](https://github.com/iris-credit/iris-sdks/pull/99) [`719d1f8`](https://github.com/iris-credit/iris-sdks/commit/719d1f84bb1399e6da221d51a8a379e59361c0d3) Thanks [@u-zzam](https://github.com/u-zzam)! - Validate the quote's health in the take flow: `take` now requires a pre-fetched `venueData` and rejects a quote whose debt exceeds the venue's max borrow for its collateral, capped by the venue LLTV minus `DEFAULT_LLTV_BUFFER` (`VenueMismatchError` / `IrisCoreErrors.UnknownVenuePrice` / `UnhealthyDebtError`). On Morpho Blue the max borrow LTV is the LLTV itself, so an uncapped take could open one accrual away from venue liquidation. Breaking: `getVenueData` now takes the venue-identifying fields directly — `{ pod?, venueId, collateralToken, debtToken, data }`, `pod` defaulting to the pod-less zero-address view, the shape a solver-signed `Quote` satisfies directly — replacing the `{ loanData, venueId, data }` form.

### Patch Changes

- Updated dependencies [[`bd09373`](https://github.com/iris-credit/iris-sdks/commit/bd0937332eb36f0e4aa9cd46570ab8d2471a0292), [`5fced83`](https://github.com/iris-credit/iris-sdks/commit/5fced835747c19d4367b8855afc9aa9616935fbd)]:
  - @iris-credit/iris-ts@0.1.1
  - @iris-credit/core-sdk@0.2.0

## 0.1.0

### Minor Changes

- [#73](https://github.com/iris-credit/iris-sdks/pull/73) [`e345dcf`](https://github.com/iris-credit/iris-sdks/commit/e345dcf6a1d3a266ca523f2c74054c780a62eb86) Thanks [@u-zzam](https://github.com/u-zzam)! - First versioned release of the Iris SDKs. Replaces the throwaway `0.0.<run>` publishing scheme with Changesets-based semantic versioning: per-package versions, changelogs, git tags, and GitHub releases.

### Patch Changes

- Updated dependencies [[`e345dcf`](https://github.com/iris-credit/iris-sdks/commit/e345dcf6a1d3a266ca523f2c74054c780a62eb86)]:
  - @iris-credit/core-sdk@0.1.0
  - @iris-credit/iris-ts@0.1.0
