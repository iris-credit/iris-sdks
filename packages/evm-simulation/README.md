# @iris-credit/evm-simulation

## Overview

EVM transaction simulation engine for Iris — bundle execution preview,
transfer parsing, and net per-account balance changes.

## Installation

```bash
pnpm add @iris-credit/evm-simulation
```

## Usage

```ts
import {
  simulate,
  type SimulationConfig,
  SimulationRevertedError,
} from "@iris-credit/evm-simulation";

const config: SimulationConfig = {
  chains: new Map([
    [
      1,
      {
        tenderlyRpc: { rpcUrl: process.env.TENDERLY_RPC_URL! },
        simulateV1Url: process.env.MAINNET_RPC_URL,
      },
    ],
  ]),
  timeoutMs: 5000,
};

try {
  const { simulationTxs, calls, transfers, assetChanges } = await simulate(config, {
    chainId: 1,
    transactions: [{ from: user, to: bundler3, data: encodedMulticall }],
    authorizations: [{ type: "signature", token: usdc, spender: adapter }],
  });
} catch (err) {
  if (err instanceof SimulationRevertedError) {
    // show err.reason to the user
  }
  throw err;
}
```

Each chain entry must declare at least one backend — `tenderlyRpc` (primary), `simulateV1Url` (fallback), or both. The type system enforces this. An `eth_simulateV1`-only configuration (`{ simulateV1Url }`) works against any JSON-RPC URL that implements it — a mainnet provider in production, an anvil fork in staging/tests.

### API surface

All symbols below are re-exported from the package root.

- `simulate(config, params)` — run a bundle through the simulation pipeline.
- Config types: `SimulationConfig`, `TenderlyRpcConfig`, `ChainSimulationConfig`, `SimulationLogger`.
- Input types: `SimulateParams`, `SimulationTransaction`, `SimulationAuthorization`.
- Result types: `SimulationResult`, `SimulationCall`, `Transfer`, `AccountAssetChanges`, `AssetChange`, `RawLog`.
- Errors: `SimulationPackageError` (abstract base — `instanceof` it to catch any package error), `SimulationRevertedError`, `BlacklistViolationError`, `ExternalServiceError`, `SimulationValidationError`, `UnsupportedChainError`.

### Behavior notes

- The pipeline is staged as validation → authorization resolution → backend
  execution → transfer parsing → bundler retention check.
- `SimulationAuthorization` entries are simulated as prepended `approve`
  transactions (`{ type: "signature" }` encodes `approve(spender, amount ?? maxUint256)`).
- Bundler retention is enforced by net `(bundler3 address, token)` balance
  with a dust threshold of `100n` raw units; bundler addresses come from
  `@iris-credit/core-sdk`'s registry. Chains unknown to the registry skip the
  check with a logger warning.
- `assetChanges` token `symbol`/`decimals` metadata is best-effort: Tenderly
  populates it, the `eth_simulateV1` fallback does not — resolve it downstream
  (e.g. via `@iris-credit/core-sdk` token entities) when needed.
- Only `ExternalServiceError` (backend unavailable) is considered bypassable
  by callers; a `SimulationRevertedError` belongs to the bundle, not the
  backend.

## License

MIT. See [LICENSE](./LICENSE).
