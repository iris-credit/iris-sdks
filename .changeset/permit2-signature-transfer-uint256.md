---
"@iris-credit/core-sdk": patch
---

`getPermit2TransferFromTypedData` no longer truncates the permitted amount to `MAX_UINT_160`. Permit2's `TokenPermissions.amount` is a `uint256`, so the clamp silently lowered any signature-transfer request above `2^160 - 1` and produced typed data that did not match the caller's intent. The clamp is now `MAX_UINT_256`.
