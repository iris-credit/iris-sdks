---
"@iris-credit/iris-sdk": patch
---

`encodeIrisSignatureAuthorization` now rejects an invalid caller-supplied `deadline` before signing. A non-positive, out-of-`uint256`, or already-expired deadline previously walked the user through a wallet EIP-712 prompt for an authorization Iris would reject with `SignatureExpired`. Adds the `InputExceedsMaxError` and `ExpiredDeadlineError` error classes.
