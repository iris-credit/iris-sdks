# core-sdk Conventions

- Keep entity math framework-agnostic and offline; confine viem I/O to each module's `fetch.ts` and to `src/augment`.
- Model protocol state as `I*` interfaces plus classes, e.g. `interface IPosition` and `class Position`.
- Constructors accept plain inputs and normalize nested classes, e.g. `AccrualPosition` wraps its loan in `new Loan(loan)`.
- Use getters for derived state, e.g. `get isHealthy()`, and methods for parameterized math, e.g. `accrueLegs(timestamp)`.
- Mirror onchain operations as transitions returning a new entity, e.g. `repay`, `refinance`, and reject the same preconditions the contract rejects.
- Keep pure protocol math in `*Utils` namespaces over plain shapes, e.g. `PositionUtils`, `LoanUtils`; classes stay thin wrappers over them.
- Keep all protocol amounts as `bigint`; accept `BigIntish` only at API edges.
- Use `MathLib` rounding helpers; spell rounding as `"Up"` or `"Down"`.
- `constants.ts` mirrors iris-core contract constants only; rate and LLTV params are WAD-scaled, venue indices RAY-scaled, venue prices ORACLE_PRICE_SCALE-scaled.
- Entity folders under `src/modules/` own their class, `*Utils`, `fetch.ts`, and barrel, e.g. `position/`, `loan/`, `venue/`.
- `Venue` is abstract; each subclass lives in `src/modules/venue/<venue>/` and carries an offline rate model matching its onchain adapter bit-for-bit.
- Treat venue fields as live observations of the evaluated block; never compose position math with venue data from another block.
- Fetchers accept a viem `Client` and return core-sdk classes, e.g. `fetchLoan(pod, client)`. A fetcher that resolves its contract from the registry resolves missing chain ids with `parameters.chainId ?? (await getChainId(client))`, then narrows via `ChainUtils.isSupportedChainId`; one taking an explicit address skips both, so it stays batchable.
- Fetch params pass through viem call fields: `blockNumber`, `blockTag`, `stateOverride`.
- Augment classes only in `src/augment`, one file per entity, e.g. `Position.fetch = fetchPosition`.
- Keep ABI literals in `src/abis/`; `CHAIN_ADDRESSES` records what is deployed and `CHAIN_REGISTRIES` what is enabled onchain — both compile-time and additive, with no runtime registration.
- Normalize untrusted addresses with viem's `getAddress`, and keep every literal address checksummed (`pnpm lint:address`).
- Throw typed errors from `IrisCoreErrors`; getters return `undefined` when an input is unknown, e.g. an unknown venue price.
- Typed-data helpers return `TypedDataDefinition` with field order matching the contract's typehash.
- Colocate unit tests as `{module}.test.ts` in `src/`; keep fork-based E2E tests in `test/` on the shared `setup.ts` fixture.
- Document public APIs with JSDoc: a Returns description, `@param` with its scale, and an `@example`.

## Continuous Improvement

- Keep entity math deterministic and RPC-free so positions can be projected offline at any timestamp.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer typed errors and protocol-faithful return types over generic failures or broad abstractions.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.
