---
"@iris-credit/iris-sdk": patch
---

Route the action- and requirement-layer chain checks through the shared `validateChainId` helper instead of inlining the `ChainIdMismatchError` guard at each call site. Pure internal maintenance: the thrown error class and arguments are unchanged.
