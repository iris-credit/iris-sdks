---
"@iris-credit/core-sdk": patch
---

Stop `AccrualPosition.supplyBond` from mutating the position it is called on. The top-up is now applied only to the returned position, matching every other projection, so a caller-owned snapshot shared across concurrent previews is no longer corrupted by a bond top-up that is never submitted.
