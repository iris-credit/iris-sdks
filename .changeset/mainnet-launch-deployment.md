---
"@iris-credit/core-sdk": minor
---

Point mainnet at the Iris launch deployment: every Iris contract in `CHAIN_ADDRESSES[ChainId.EthMainnet]` (Iris, both BLMs, the pod implementation, Bundler3, the general adapter and the Aave V3, Morpho Blue and now SparkLend adapters) moves to its new address, and `CHAIN_REGISTRIES[ChainId.EthMainnet]` records the live launch configuration: Aave V3, Morpho Blue and SparkLend as venues 0-2, with SparkLend served by the `0x` payload alongside Aave V3; the Morpho Blue cbBTC/USDC, cbBTC/USDT, WBTC/USDC, WBTC/USDT and wstETH/USDC markets; the `Blm` (the `WhitelistBlm` is deployed but not enabled); and the 90% bond LLTV. The mainnet registry drops wstETH/USDT, which the launch deployment does not enable. Loans, authorizations, allowances and signatures made against the previous mainnet deployment do not carry over.
