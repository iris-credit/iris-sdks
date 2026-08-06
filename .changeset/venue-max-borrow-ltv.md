---
"@iris-credit/core-sdk": minor
---

`Venue.getMaxBorrowAmount` takes a `MaxBorrowOptions` object — `(collateral, { maxLtv?, timestamp? }?)` — with a new optional `maxLtv` (scaled by WAD) to measure the bound at, defaulting to — and capped by — the venue's max borrow LTV, so a caller can tighten the limit (e.g. the take flow's buffered venue LLTV) but never exceed the venue's own. Breaking: `timestamp` moved from the second positional parameter into the options object.
