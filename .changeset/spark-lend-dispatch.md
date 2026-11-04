---
"@iris-credit/core-sdk": minor
---

`CHAIN_ADDRESSES` gains `sparkLendAdapter`, and `fetchVenue` dispatches it to `fetchSparkLendVenue`. VNet records the adapter the devnet registers as venue 2, and its registry lists `venues.sparkLend`. Mainnet holds the zero address until its adapter is deployed; `fetchVenue` rejects a zero adapter before it dispatches, so the placeholder never matches.

`MarketData.venue` becomes `MarketData.venues`, the venues whose adapters take the payload. Enablement is per payload, not per venue, so one payload can serve several: the Aave V3 and SparkLend adapters both ignore it, and `0x` serves both. Replace `marketData.venue === name` with `marketData.venues.includes(name)`.
