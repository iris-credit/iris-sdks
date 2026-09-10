---
"@iris-credit/evm-simulation": patch
---

Use core-sdk chain metadata when parsing WETH9 `Deposit` and `Withdrawal` logs:
accept them only from the chain's registered `wNative` token, and retain legacy
signature-based parsing on chains core-sdk does not know.
