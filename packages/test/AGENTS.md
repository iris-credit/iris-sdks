# test Conventions

- This package owns Anvil, viem, and Vitest test utilities.
- `anvil.ts` owns Anvil lifecycle; `client.ts` owns viem client extensions.
- `createViemTest(chain, parameters)` should set deterministic defaults such as zero gas and timestamp interval.
- Extend viem clients through `createAnvilTestClient`; keep helpers like `balanceOf` and `approve` on the test client.
- BigInts are JSON-serialized in the Vitest setup by adding `BigInt.prototype.toJSON`.
- Export public entrypoints explicitly: `@iris-credit/test/vitest` and `/fixtures`.
- Deterministic fixtures and account helpers stay in `fixtures.ts`.
- Deterministic accounts come from the standard test mnemonic via `testAccount(index)`.
- Use `checksumAddress` for generated addresses, e.g. `randomAddress(chainId)`.
- Trace assertions use `getFunctionCalls` over Anvil `ots_traceTransaction`.

## Continuous Improvement

- Keep runner and fork I/O explicit; test helpers should be deterministic unless a test intentionally controls time or randomness.
- Prefer small shared fixtures and typed helpers over broad test abstractions.
