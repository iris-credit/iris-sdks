# iris-sdk Conventions

> Design decisions, protocol context, and the requirements system: see [`ARCHITECTURE.md`](./ARCHITECTURE.md). The bullets below are how changes land.

- Layer one way, Client → Entity → Action: `irisViemExtension` builds a stateless namespace (no cache, no `init()`, options deep-frozen); the `Iris` entity reads state and validates; actions only encode calldata.
- Entity flows return lazy `{ buildTx, getRequirements }`: `buildTx` stays synchronous and pure, and every read that can wait lives in `getRequirements`.
- Keep flows fetch-first: they take pre-fetched `loanData` / `positionData` / `newVenue` / `claimableData` from the entity's `get*Data` getters and never fetch inside the flow.
- Mirror `Iris.sol`'s rejections locally with typed errors — the pure subset of the contract's requires — and do not re-read guarantees the RFQ or the contract verifies (solver signature, enabled configuration, bond requirement).
- Actions are pure encoders returning deep-frozen `Transaction<TAction>` with a typed `action` discriminator — no RPC, no clock, no signing — composing bundles in on-chain execution order with explicit `skipRevert` args.
- Route through Bundler3 / `GeneralAdapter1` only when the flow moves tokens in; withdraw and claim paths encode direct Iris calls.
- Forward-accrue accruing pulls (repay, escape, refinance) two hours past now and sweep the residual back to the receiver; funding the fetched amount under-funds the pull. Repay-sized pulls add `REPAY_ROUNDING_HEADROOM`: the pre-maturity fixed leg is a fixed total the projection only re-rounds, so it can settle one unit above the projection at the mined block.
- Buffer LLTV ceilings by `DEFAULT_LLTV_BUFFER`: withdraw ceilings below the venue / bond LLTV so a withdrawal sized to the fetched state still clears the on-chain check, and take's max borrow below the venue LLTV so the loan does not open one accrual away from venue liquidation.
- Enforce builder = signer: entity flows `validateUserAddress` against the role the contract pins (borrower or solver), and signature encoders re-enforce it at `sign()` time.
- `buildTx` consumes at most one permit and one authorization signature; split arrays with `selectRequirementSignatures`, rejecting ambiguous or unexpected kinds instead of dropping them.
- One exported class per failure mode in `src/types/errors.ts`; messages read like instructions, with interpolated values quoted.
- Keep solver (maker) helpers in `src/actions/solver/`: sign quotes verbatim, derive the Permit2 payload from the quote itself, and verify signatures (ERC-1271-capable) before returning them.
- Keep bundler ABI literals in `src/abis/`; protocol ABIs, addresses and constants come from `@iris-credit/core-sdk`.
- `viem` is the only peer dependency; `core-sdk` and `iris-ts` ship as regular dependencies. Keep the package framework-free.
- Colocate unit tests as `{module}.test.ts` in `src/`, mocking RPC at the custom-transport boundary; the fork harness in `test/setup.ts` is for the tests that need a real chain, such as signature verification. End-to-end fork tests that execute transactions against the deployed contracts live under `test/actions/`.
- Document public APIs with JSDoc: a description, `@param`, `@returns`, `@throws` per typed error, and an `@example`.

## Continuous Improvement

- A change that alters a decision recorded in `ARCHITECTURE.md` — layering, routing, the funding pattern, the requirements flow — updates it in the same PR.
- Keep the lazy-handle contract stable: reads stay in `getRequirements`, encoding stays in `buildTx`.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer typed errors and protocol-faithful validation over generic failures or broad abstractions.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.
