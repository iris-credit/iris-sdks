---
"@iris-credit/iris-sdk": patch
---

`irisTake` no longer freezes the caller's `Quote` in place: the quote is copied into the returned `action.args` before the transaction is deep-frozen.
