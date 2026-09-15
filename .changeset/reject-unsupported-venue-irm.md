---
"@iris-credit/core-sdk": minor
"@iris-credit/iris-sdk": patch
---

Throw `UnsupportedVenueIrmError` when a Morpho Blue venue is asked to quote a rate for, or project positive debt on, an interest-rate model the SDK cannot model offline — instead of charging it at a zero rate, which understated debt and overstated free collateral.

`IMorphoBlueMarket` now carries the market's `irm`, so the venue tells an idle market (zero IRM, no interest) apart from a nonzero model it has no `rateAtTarget` for. Exactly interest-free accruals are preserved: idle markets, same-timestamp snapshots, and debt-free markets still accrue without throwing.
