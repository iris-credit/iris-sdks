---
"@iris-credit/core-sdk": patch
---

Add Morpho Blue's events (`AccrueInterest`, `Borrow`, `CreateMarket`, `EnableIrm`, `EnableLltv`, `FlashLoan`, `IncrementNonce`, `Liquidate`, `Repay`, `SetAuthorization`, `SetFee`, `SetFeeRecipient`, `SetOwner`, `Supply`, `SupplyCollateral`, `Withdraw`, `WithdrawCollateral`) to `morphoBlueAbi`, which previously carried only the interface's functions. Consumers can now decode and subscribe to Morpho events without declaring them inline.
