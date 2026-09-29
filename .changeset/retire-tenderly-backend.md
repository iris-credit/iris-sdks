---
"@iris-credit/evm-simulation": major
---

Retire the Tenderly RPC backend; `eth_simulateV1` is now the sole simulation backend. `ChainSimulationConfig` is now `{ simulateV1Url: string }` (required), `TenderlyRpcConfig` is removed, and `timeoutMs` is the budget for the single `eth_simulateV1` request with no fallback or retry. Drops the `zod` dependency.
