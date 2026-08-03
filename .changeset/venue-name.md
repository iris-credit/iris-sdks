---
"@iris-credit/core-sdk": patch
---

Add `VenueName` (`aaveV3` | `morphoBlue`, matching the chain registries' `venues` keys) and an abstract `Venue.name` discriminant carried by every venue subclass, and tighten the registry types (`venues`, `MarketData.venue`) to it.
