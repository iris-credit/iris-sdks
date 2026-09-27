---
"@iris-credit/iris-sdk": patch
---

Pin the `authorized` operator to the chain's registered `GeneralAdapter1` in
`encodeIrisSignatureAuthorization`. Previously the encoder embedded any caller-supplied
`authorized` address into the Iris `Authorization` EIP-712 payload, so a direct caller could be
walked through signing an authorization that grants an arbitrary address operator rights over the
signer's Iris positions. It now throws `UnsupportedAuthorizationOperatorError` up front — matching
`getIrisAuthorizationAction`, which already rejected such a signature at bundler-encoding time —
for grant and revocation payloads alike.
