---
"@iris-credit/core-sdk": minor
---

Point mainnet at the Iris launch deployment: every Iris contract in `CHAIN_ADDRESSES[ChainId.EthMainnet]` (Iris, both BLMs, the pod implementation, Bundler3, the general adapter and the Aave V3, Morpho Blue and now SparkLend adapters) moves to its new address, and `CHAIN_REGISTRIES[ChainId.EthMainnet]` records the launch configuration, with SparkLend registered as venue 2 and served by the `0x` payload alongside Aave V3. Loans, authorizations, allowances and signatures made against the previous mainnet deployment do not carry over.
