---
"@iris-credit/core-sdk": minor
---

Model SparkLend as a venue. `SparkLendVenue`, `SparkLendMath` and `fetchSparkLendVenue` mirror SparkLend's Aave V3.0 core bit for bit: token balances, mints and burns round half up, the variable borrow index compounds with the v3.0 binomial approximation, and the borrow and supply bounds follow its cap checks, with no virtual accounting. `sparkLendPoolAbi`, the `sparkLendPool` and `sparkLendOracle` addresses and `getSparkLendSpToken`/`getSparkLendVToken` come with it. `fetchSparkLendVenue` throws `SparkLendStableBorrowingError` for a reserve with stable-rate borrowing enabled, since the math leaves stable debt out.

`VenueName` gains `sparkLend`. Code that handles `VenueName` exhaustively, such as a `switch` or a `Record<VenueName, …>`, needs a SparkLend case.

`fetchVenue` does not dispatch to SparkLend yet. Dispatch follows once the SparkLend venue adapter is deployed and registered on Iris.
