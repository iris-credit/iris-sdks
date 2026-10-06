---
"@iris-credit/core-sdk": patch
---

Require `@iris-credit/iris-ts` ^0.1.1 as the peer dependency. The registry helpers import `isHexEqual`, which 0.1.0 does not export, so a consumer that pinned 0.1.0 crashed at module link time without any install-time warning.
