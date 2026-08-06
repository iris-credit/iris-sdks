# @iris-credit/core-sdk

## 0.2.0

### Minor Changes

- [#99](https://github.com/iris-credit/iris-sdks/pull/99) [`5fced83`](https://github.com/iris-credit/iris-sdks/commit/5fced835747c19d4367b8855afc9aa9616935fbd) Thanks [@u-zzam](https://github.com/u-zzam)! - `Venue.getMaxBorrowAmount` takes a `MaxBorrowOptions` object — `(collateral, { maxLtv?, timestamp? }?)` — with a new optional `maxLtv` (scaled by WAD) to measure the bound at, defaulting to — and capped by — the venue's max borrow LTV, so a caller can tighten the limit (e.g. the take flow's buffered venue LLTV) but never exceed the venue's own. Breaking: `timestamp` moved from the second positional parameter into the options object.

### Patch Changes

- Updated dependencies [[`bd09373`](https://github.com/iris-credit/iris-sdks/commit/bd0937332eb36f0e4aa9cd46570ab8d2471a0292)]:
  - @iris-credit/iris-ts@0.1.1

## 0.1.4

### Patch Changes

- [#95](https://github.com/iris-credit/iris-sdks/pull/95) [`9f2f7a9`](https://github.com/iris-credit/iris-sdks/commit/9f2f7a9b7ab3d26eb821ea5fefdd7028874e10cc) Thanks [@u-zzam](https://github.com/u-zzam)! - Add `Venue.borrowApy` — the venue's current borrow-side APY as the venue itself quotes it (scaled by WAD). Aave V3 compounds the debt reserve's `currentVariableBorrowRate` per second over a year in exact integer math (the Aave app's `variableBorrowAPY` — the new `AaveV3Math.rateToApy`, backed by the new `rayPow`/`rayToWad`); Morpho Blue compounds the Adaptive Curve IRM's instantaneous rate at the market's utilization continuously (the new `MorphoBlueMath.rateToApy`) — `MorphoBlueVenue.getBorrowApy(timestamp)` projects the rate's adaptation to a later timestamp; markets off the canonical IRM answer 0n, matching their zero-rate accrual.

- [#98](https://github.com/iris-credit/iris-sdks/pull/98) [`b705cfd`](https://github.com/iris-credit/iris-sdks/commit/b705cfd748a48431ee7002ceec981d92bf592bc2) Thanks [@u-zzam](https://github.com/u-zzam)! - Add `Venue.ltv` — the venue's maximum borrow LTV (scaled by WAD), the limit new debt is validated against: Aave V3 answers the collateral reserve's max LTV (not the venue's `lltv`, Aave's liquidation threshold), Morpho Blue answers the market's LLTV itself.

## 0.1.3

### Patch Changes

- [#93](https://github.com/iris-credit/iris-sdks/pull/93) [`cd698e8`](https://github.com/iris-credit/iris-sdks/commit/cd698e8b3a24fb0d2f87092d83c15b17ae84e70c) Thanks [@u-zzam](https://github.com/u-zzam)! - Add the venue borrow and supply bounds, mirrored with each venue's native validation math:

  - `Venue.getMaxBorrowAmount(collateral, timestamp?)` — the most debt actually borrowable against a given collateral. Aave V3 bounds by the collateral reserve's max LTV at Aave's own oracle prices through the aToken/vToken scaling; Morpho Blue bounds by the LLTV through the borrow-shares round-trip on the accrued market; both are further bounded by `getMaxBorrowCapacity`, so a paused or dry venue answers zero rather than an unexecutable amount.
  - `Venue.getMaxBorrowCapacity(timestamp?)` — the most debt the venue lends regardless of collateral. Aave V3 mirrors `validateBorrow`'s reserve checks (flags, available liquidity, aToken supply, borrow cap headroom); Morpho Blue is the accrued market's idle supply, with an optional target utilization.
  - `Venue.getMaxSupplyCapacity(timestamp?)` — the most collateral the venue accepts supplying. Aave V3 mirrors `validateSupply`'s cap check including the treasury's pending mint (`ReserveLogic._accrueToTreasury`); Morpho Blue is unlimited.

  `fetchVenue` hydrates the Aave reserve observations these need — the packed `configuration` word, oracle `assetPrice`s (via the new `aaveV3Oracle` registry entry) and the token-level supply/liquidity readings carried on the venue, all fired in a single round via the pinned per-chain Aave reserve token registry (`getAToken`/`getVToken`) — and `AaveV3Math` gains the backing primitives (`PERCENTAGE_FACTOR`, `percentMul`, `getATokenMintScaledAmount`), the new `ReserveConfigurationLib` mirrors Aave's `ReserveConfiguration` decoders (`getLtv`/`getDecimals`/`getFlags`/`getReserveFactor`/`getBorrowCap`/`getSupplyCap`), `MorphoBlueMath` gains `toAssetsDown`, and the full `IAaveOracle`/`IAToken`/`IVariableDebtToken` interface ABIs are exported.

## 0.1.2

### Patch Changes

- [#88](https://github.com/iris-credit/iris-sdks/pull/88) [`0c32097`](https://github.com/iris-credit/iris-sdks/commit/0c3209750c809f552b29be60b5a836eb6fd187ab) Thanks [@madiha-right](https://github.com/madiha-right)! - Add `VenueName` (`aaveV3` | `morphoBlue`, matching the chain registries' `venues` keys) and an abstract `Venue.name` discriminant carried by every venue subclass, and tighten the registry types (`venues`, `MarketData.venue`) to it.

## 0.1.1

### Patch Changes

- [#87](https://github.com/iris-credit/iris-sdks/pull/87) [`dfe7d18`](https://github.com/iris-credit/iris-sdks/commit/dfe7d180563712f917b9c28bed6957236b17579a) Thanks [@madiha-right](https://github.com/madiha-right)! - Throw `IrisCoreErrors.ZeroBondRequirement` from `Blm.bondRequirement` when the computed requirement is zero (unconfigured token or dust debt) — such quotes are unsubmittable since `Iris.open` requires a nonzero bond requirement.

## 0.1.0

### Minor Changes

- [#73](https://github.com/iris-credit/iris-sdks/pull/73) [`e345dcf`](https://github.com/iris-credit/iris-sdks/commit/e345dcf6a1d3a266ca523f2c74054c780a62eb86) Thanks [@u-zzam](https://github.com/u-zzam)! - First versioned release of the Iris SDKs. Replaces the throwaway `0.0.<run>` publishing scheme with Changesets-based semantic versioning: per-package versions, changelogs, git tags, and GitHub releases.

### Patch Changes

- Updated dependencies [[`e345dcf`](https://github.com/iris-credit/iris-sdks/commit/e345dcf6a1d3a266ca523f2c74054c780a62eb86)]:
  - @iris-credit/iris-ts@0.1.0
