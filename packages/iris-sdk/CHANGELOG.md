# @iris-credit/iris-sdk

## 0.3.6

### Patch Changes

- [#122](https://github.com/iris-credit/iris-sdks/pull/122) [`4b48045`](https://github.com/iris-credit/iris-sdks/commit/4b4804505fcf12ab584d021781528ca6220a80d8) Thanks [@madiha-right](https://github.com/madiha-right)! - Route the action- and requirement-layer chain checks through the shared `validateChainId` helper instead of inlining the `ChainIdMismatchError` guard at each call site. Pure internal maintenance: the thrown error class and arguments are unchanged.

- Updated dependencies [[`afa90e9`](https://github.com/iris-credit/iris-sdks/commit/afa90e9a0cfa9b66f0dd8211020aae6c9dff5403)]:
  - @iris-credit/core-sdk@0.4.1

## 0.3.5

### Patch Changes

- [#114](https://github.com/iris-credit/iris-sdks/pull/114) [`737bd07`](https://github.com/iris-credit/iris-sdks/commit/737bd078a76f839d0d6f71c947478662e6d3c088) Thanks [@u-zzam](https://github.com/u-zzam)! - `irisTake` no longer freezes the caller's `Quote` in place: the quote is copied into the returned `action.args` before the transaction is deep-frozen.

## 0.3.4

### Patch Changes

- [#112](https://github.com/iris-credit/iris-sdks/pull/112) [`1b33d21`](https://github.com/iris-credit/iris-sdks/commit/1b33d21b80baa6db1db5df28427afb21c7bdb313) Thanks [@madiha-right](https://github.com/madiha-right)! - Mirror iris-core's refinance liquidatable gate: `AccrualPosition.refinance` now throws the new `IrisCoreErrors.LiquidatableLoan` once the loan is past `maturity + overduePeriod` at the accrual timestamp — the contract rejects the call the same way, and the error joins the vendored `irisAbi`. `Iris.refinance` inherits the rejection through the replay, evaluated at the 2h projected accrual timestamp like every other precondition.

- Updated dependencies [[`1b33d21`](https://github.com/iris-credit/iris-sdks/commit/1b33d21b80baa6db1db5df28427afb21c7bdb313)]:
  - @iris-credit/core-sdk@0.4.0

## 0.3.3

### Patch Changes

- [#110](https://github.com/iris-credit/iris-sdks/pull/110) [`b668b5c`](https://github.com/iris-credit/iris-sdks/commit/b668b5c7a79b5b5c8a0ef91c04e9516c36b415be) Thanks [@madiha-right](https://github.com/madiha-right)! - Fund `repay` and `close` with one unit of rounding headroom (`REPAY_ROUNDING_HEADROOM`) on top of the 2h projection. Before maturity the settled fixed leg is two separately floored terms — accrued to the settlement timestamp, residual from there to maturity — whose exact sum does not depend on that timestamp, so the projection re-rounds the split rather than bounding it and the contract's figure at the mined block could sit one unit above the funding, reverting the pull with `ERC20: transfer amount exceeds balance` out of `GeneralAdapter1`. The sweep returns the unit.

## 0.3.2

### Patch Changes

- [#108](https://github.com/iris-credit/iris-sdks/pull/108) [`139465a`](https://github.com/iris-credit/iris-sdks/commit/139465a12b37c75252195b72b423a4821dfa9686) Thanks [@u-zzam](https://github.com/u-zzam)! - Gate the ERC-2612 simple-permit path on `SIMPLE_PERMIT_TOKENS` — a per-chain allowlist of tokens whose permit is verified against the live deployment, recording the EIP-712 domain version each one signs: USDC, cbBTC, and stETH (`"2"`) and wstETH (`"1"`), each checked against its onchain `DOMAIN_SEPARATOR()`. `getPermitTypedData` takes its domain `version` from the allowlist, so cbBTC now signs version `"2"` and settles instead of reverting, and an unverified token routes to Permit2 without even a nonce probe instead of signing a guessed domain. `VNet` omits cbBTC: FiatTokenV2_1 computes its domain separator once at initialization, so on a fork it still verifies against mainnet's chain id.

- Updated dependencies [[`139465a`](https://github.com/iris-credit/iris-sdks/commit/139465a12b37c75252195b72b423a4821dfa9686)]:
  - @iris-credit/core-sdk@0.3.1

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
