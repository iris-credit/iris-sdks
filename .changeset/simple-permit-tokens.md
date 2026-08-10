---
"@iris-credit/core-sdk": patch
"@iris-credit/iris-sdk": patch
---

Gate the ERC-2612 simple-permit path on `SIMPLE_PERMIT_TOKENS` — a per-chain allowlist of tokens whose permit is verified against the live deployment, recording the EIP-712 domain version each one signs, read via `getSimplePermitTokens(chainId)` and `getPermitDomainVersion(token, chainId)`. cbBTC now signs version `"2"` and settles instead of reverting, and an unverified token routes to Permit2 without even a nonce probe instead of signing a guessed domain. The allowlist covers USDC, cbBTC, and stETH (`"2"`) and wstETH (`"1"`), each checked against its onchain `DOMAIN_SEPARATOR()`. `VNet` omits cbBTC: FiatTokenV2_1 computes its domain separator once at initialization, so on a fork it still verifies against mainnet's chain id.
