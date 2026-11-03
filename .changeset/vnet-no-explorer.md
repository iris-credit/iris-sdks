---
"@iris-credit/core-sdk": minor
---

Drop the dead block explorer URL from the VNet (chain 9991) metadata: the devnet is now a self-hosted anvil mainnet fork with no explorer, and the previous URL no longer resolved. `ChainMetadata.explorerUrl` is now optional and omitted for a chain without an explorer, and `ChainUtils.getExplorerUrl`, `getExplorerAddressUrl` and `getExplorerTransactionUrl` return `string | undefined`, returning `undefined` for such a chain instead of a link that 404s. Callers that used the result as a `string` must handle `undefined`, e.g. by rendering plain text.
