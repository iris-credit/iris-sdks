---
"@iris-credit/test": patch
---

Anvil test clients with automine enabled now wait for the local block number to advance after `writeContract`, `sendTransaction` and `sendRawTransaction` before polling the receipt, and `createAnvilTestClient` answers `eth_getTransactionReceipt` with null while the transaction is still in Anvil's pool (checked with `txpool_content`, which Anvil answers locally). Anvil forwards a receipt lookup it can't answer to the fork RPC, which can take seconds to return null for a hash only Anvil knows. The 180 s receipt timeout is unchanged.
