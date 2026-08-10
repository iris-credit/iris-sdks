---
"@iris-credit/core-sdk": minor
---

`CHAIN_REGISTRIES.marketDatas` keys entries by their enabled hash — `keccak256(data)`, i.e. the Morpho market id for Morpho Blue payloads — typed `Record<Hex, MarketData>`, so a hash observed onchain indexes its preimage directly; the pair-named payload consts are gone and each chain record inlines its own payloads. A new `getMarketData(chainId, dataHash)` helper returns the entry for a runtime-typed hash — direct `marketDatas` indexing keeps exact literal keys — and throws the new `UnknownDataHashError` when the hash is not recorded. Breaking: the previous human labels (e.g. `"morphoBlue:cbBTC/USDC"`) no longer key `marketDatas`.
