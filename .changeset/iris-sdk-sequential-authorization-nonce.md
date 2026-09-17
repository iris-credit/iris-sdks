---
"@iris-credit/iris-sdk": minor
---

Mirror the audited Iris's sequential authorization nonce. `encodeIrisSignatureAuthorization` now requires `nonce` — the signer's current `Iris.nonce(authorizer)` — instead of defaulting to a random value, and `getIrisAuthorizationRequirement` fetches the user's authorization state and nonce through core-sdk's `fetchUser`, so the signable requirement carries the onchain nonce. Only one outstanding signed authorization per account is valid at a time.
