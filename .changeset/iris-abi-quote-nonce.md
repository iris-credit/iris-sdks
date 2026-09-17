---
"@iris-credit/core-sdk": minor
---

Sync `irisAbi` with the audited Iris contract. `isNonceUsed(authorizer, nonce)` is renamed to `isQuoteNonceUsed(solver, nonce)` and now covers quote nonces only; the new `nonce(authorizer)` view exposes the sequential authorization nonce that `setAuthorizationWithSig` requires; `take` emits the new `SetQuoteNonce(caller, solver, nonce)` event, leaving `SetNonce` to authorizations; and `Rebase` carries `newFixedLeg` and `newBond` right after `newDebt`. Accordingly, `fetchIsNonceUsed(authorizer, …)` is renamed to `fetchIsQuoteNonceUsed(solver, …)`.

`fetchUser` now also reads `nonce(address)` alongside `isAuthorized`, and `User` carries the result as `nonce` — the user's next Iris authorization nonce. `Authorization.nonce` is sequential: sign exactly the onchain `Iris.nonce(authorizer)` value.
