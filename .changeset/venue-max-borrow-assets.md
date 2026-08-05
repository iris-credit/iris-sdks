---
"@iris-credit/core-sdk": patch
---

Add the venue borrow and supply bounds, mirrored with each venue's native validation math:

- `Venue.getMaxBorrowAmount(collateral, timestamp?)` — the most debt actually borrowable against a given collateral. Aave V3 bounds by the collateral reserve's max LTV at Aave's own oracle prices through the aToken/vToken scaling; Morpho Blue bounds by the LLTV through the borrow-shares round-trip on the accrued market; both are further bounded by `getMaxBorrowCapacity`, so a paused or dry venue answers zero rather than an unexecutable amount.
- `Venue.getMaxBorrowCapacity(timestamp?)` — the most debt the venue lends regardless of collateral. Aave V3 mirrors `validateBorrow`'s reserve checks (flags, available liquidity, aToken supply, borrow cap headroom); Morpho Blue is the accrued market's idle supply, with an optional target utilization.
- `Venue.getMaxSupplyCapacity(timestamp?)` — the most collateral the venue accepts supplying. Aave V3 mirrors `validateSupply`'s cap check including the treasury's pending mint (`ReserveLogic._accrueToTreasury`); Morpho Blue is unlimited.

`fetchVenue` hydrates the Aave reserve observations these need — the packed `configuration` word, oracle `assetPrice`s (via the new `aaveV3Oracle` registry entry) and the token-level supply/liquidity readings carried on the venue, all fired in a single round via the pinned per-chain Aave reserve token registry (`getAToken`/`getVToken`) — and `AaveV3Math` gains the backing primitives (`PERCENTAGE_FACTOR`, `percentMul`, `getATokenMintScaledAmount`), the new `ReserveConfigurationLib` mirrors Aave's `ReserveConfiguration` decoders (`getLtv`/`getDecimals`/`getFlags`/`getReserveFactor`/`getBorrowCap`/`getSupplyCap`), `MorphoBlueMath` gains `toAssetsDown`, and the full `IAaveOracle`/`IAToken`/`IVariableDebtToken` interface ABIs are exported.
