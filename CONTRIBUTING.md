# Contributing to Iris SDKs

This monorepo contains the TypeScript SDK packages used to interact with the Iris credit protocol: transaction building, protocol entities and viem fetchers, formatting helpers, EVM simulation tooling, and test utilities. [`README.md`](./README.md) maps the packages and their intended entry points.

## Development Setup

### Prerequisites

- Node.js `>=22`, declared by the root `engines` field; [`.nvmrc`](./.nvmrc) pins `v22.18.0`, which is what CI uses
- pnpm `11`, declared by the root `packageManager` field
- Git
- [Foundry](https://book.getfoundry.sh/getting-started/installation) — `anvil` must be on `PATH`, since the fork-backed suites spawn it as a child process
- An Ethereum mainnet RPC URL for fork-backed tests (optional; see below)

Enable pnpm through Corepack if needed:

```bash
corepack enable
```

### Clone and Install

```bash
git clone https://github.com/iris-credit/iris-sdks.git
cd iris-sdks
pnpm install --frozen-lockfile
```

### Run Checks

Run the root checks before opening a PR:

```bash
pnpm lint
pnpm build
pnpm test
```

`pnpm build` runs `tsc --noEmit` plus the CJS/ESM compile in every package, so it is the typecheck gate as well. `pnpm test` fans out through Turborepo.

Fork-backed tests default to the public `https://eth.drpc.org` endpoint, which rate-limits shared IPs. Point `MAINNET_RPC_URL` at a dedicated archive RPC when they flake — either export it, or copy `.env.example` to `.env` (loaded by `pnpm test` at the root):

```bash
export MAINNET_RPC_URL="https://mainnet.gateway.tenderly.co"
pnpm test
```

Other useful commands:

```bash
pnpm format
pnpm lint:address
```

## Code Style

oxlint owns linting and oxfmt owns formatting. Run `pnpm lint` before pushing; the pre-commit hook runs oxlint, oxfmt, and the address-checksum script through lint-staged over staged `*.{ts,tsx}` files, then the full test suite.

`pnpm lint:address` rewrites every hex address literal in the repo to its checksummed form in place — commit whatever it changes.

The per-package rules — entity/`*Utils` split, `bigint` for onchain quantities, `.js` extensions on relative imports, typed errors, JSDoc shape, test placement, WAD/RAY scale annotations — live in each package's `AGENTS.md`: [`core-sdk`](./packages/core-sdk/AGENTS.md), [`evm-simulation`](./packages/evm-simulation/AGENTS.md), [`iris-ts`](./packages/iris-ts/AGENTS.md), [`test`](./packages/test/AGENTS.md). The sibling `CLAUDE.md` files just point at them. Don't restate those rules here; if you change them, change them there.

## Pull Request Process

1. Create a focused branch from `main`.
2. Make the smallest coherent change for the PR — one concern per PR.
3. Add or update tests when behavior changes. Colocate unit tests as `{module}.test.ts` next to the source in `src/`; keep fork-based E2E tests in the package's `test/` directory on the shared `setup.ts` fixture.
4. Run `pnpm lint`, `pnpm build`, and `pnpm test`.
5. Include a changeset (`pnpm changeset`) when the change is semver-relevant for a published package — see [Releases](#releases). Don't hand-write versions or changelog entries.

## Releases

Releases are automated with [Changesets](https://github.com/changesets/changesets) through [`publish.yml`](./.github/workflows/publish.yml). Packages are published to public npm through OIDC Trusted Publishing — no npm token is involved.

### Adding a changeset

Every PR that makes a semver-relevant change to published package source must include a changeset:

```bash
pnpm changeset
```

Pick the affected packages and the bump level — `patch` (bug fixes, internal maintenance), `minor` (additive API surface), `major` (breaking changes) — and write a consumer-facing summary; it becomes the `CHANGELOG.md` entry. Commit the generated `.changeset/*.md` file together with the change. While packages are on `0.x`, `minor` is the breaking bump; `major` is reserved for graduating to `1.0.0`.

Skip the changeset when the diff only touches repo metadata, CI, documentation, or tests — those don't change the published package contract. Never edit package versions or `CHANGELOG.md` files by hand; the release automation owns them.

Internal dependents that consume a package through regular `dependencies` are bumped automatically — a changeset for `iris-ts` also patch-bumps `iris-sdk` and `evm-simulation` so their published ranges keep resolving. Internal `peerDependencies` are deliberately explicit semver ranges instead of `workspace:` ranges (`core-sdk` → `iris-ts`), so Changesets never auto-escalates the peer dependent to a major; the flip side is manual: when a bump moves a package outside a dependent's declared peer range, widen that range and include the dependent in your changeset yourself.

### Release flow (what happens after merge)

On every push to `main`, the workflow does one of two things:

1. Pending changesets exist → it opens or updates the `chore: version packages` **Version PR**, which applies all pending bumps and `CHANGELOG.md` entries.
2. No pending changesets (a Version PR just merged) → it builds and publishes the bumped packages to npm, pushes one git tag per package (e.g. `@iris-credit/core-sdk@0.2.0`), and creates matching GitHub Releases.

Merging the Version PR is the release trigger, so changesets from several PRs can batch into a single release.

One operational caveat: a brand-new package cannot be published by the workflow until it has been published manually once and had its trusted publisher configured on npmjs.com (bound to this repository and the `publish.yml` workflow filename). Finish that setup before merging the Version PR that first releases the package.

## Listing a New Chain to Support

Use this checklist when adding a chain to the SDKs. `CHAIN_ADDRESSES`, `CHAIN_REGISTRIES`, and `unwrappedTokensMapping` are each constrained to `Record<ChainId, ...>`, so `pnpm build` fails until every map carries the new chain — the compiler enforces steps 3 through 5 for you.

### 1. Add the Chain ID

Update `ChainId` in `packages/core-sdk/src/chain.ts`:

```typescript
export const ChainId = {
  EthMainnet: 1,
  YourNewChain: 12345,
} as const;
```

### 2. Add Chain Metadata

Update `ChainUtils.CHAIN_METADATA` in `packages/core-sdk/src/chain.ts`:

```typescript
[ChainId.YourNewChain]: {
  name: "Your Chain Name",
  id: ChainId.YourNewChain,
  nativeCurrency: {
    name: "Native Token Name",
    symbol: "SYMBOL",
    decimals: 18,
  },
  explorerUrl: "https://explorer.yourchain.com",
  identifier: "yourchain",
},
```

### 3. Add Contract Addresses

Update `CHAIN_ADDRESSES` in `packages/core-sdk/src/addresses.ts`:

```typescript
[ChainId.YourNewChain]: {
  // Iris protocol contracts.
  iris: "0x...",
  blm: "0x...",
  podImpl: "0x...",
  whitelistBlm: "0x...",
  permit2: PERMIT2_ADDRESS,
  multicall3: MULTICALL3_ADDRESS,
  wNative: "0x...",
  bundler3: {
    bundler3: "0x...",
    generalAdapter1: "0x...",
  },
  // Protocol integrations.
  aaveV3Adapter: "0x...",
  aaveV3Pool: "0x...",
  tokens: {
    USDC: "0x...",
    WETH: "0x...",
  },
},
```

Everything up to and including `wNative` is declared in `ChainAddressesBase` and required on every chain. The protocol integrations and `tokens` entries below it are inferred per chain, so omit an integration the chain does not have rather than adding a null-checked entry. Reuse the shared `PERMIT2_ADDRESS` and `MULTICALL3_ADDRESS` constants unless the chain deploys them off their canonical addresses.

`wNative` and a `tokens` entry may hold the same address — `wNative` is a role, the `tokens` key is an identity. That is expected, not a mistake to factor out.

### 4. Add the Onchain Registry

Update `CHAIN_REGISTRIES` in `packages/core-sdk/src/registries.ts`. This records what is _enabled_ on the Iris contract, as opposed to `CHAIN_ADDRESSES`, which records what is deployed:

```typescript
[ChainId.YourNewChain]: {
  deploymentBlock: 12_345_678n,
  bondLltvs: [900_000_000_000_000_000n],
  blms: { blm: CHAIN_ADDRESSES[ChainId.YourNewChain].blm },
  venues: { aaveV3: 0n },
  marketDatas: {
    // Each key is its entry's enabled hash, `keccak256(data)` — here `keccak256("0x")`,
    // since the Aave v3 adapter ignores the payload.
    "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470": {
      venue: "aaveV3",
      data: "0x",
    },
  },
},
```

Market data payloads are recorded as preimages because the contract only stores `keccak256(data)` — the bytes are unrecoverable from onchain or indexed state, so newly enabled payloads have to come from the enablement (ops) side.

### 5. Add Wrapped Native Token Mapping

Update `unwrappedTokensMapping` in `packages/core-sdk/src/addresses.ts`:

```typescript
[ChainId.YourNewChain]: {
  [CHAIN_ADDRESSES[ChainId.YourNewChain].wNative]: NATIVE_ADDRESS,
},
```

Key this entry off `wNative`, never off a `tokens` symbol. The two alias on mainnet, but on a chain whose native wrapper isn't WETH, `tokens.WETH` is bridged WETH — keying off it would register the wrong asset as the native wrapper and leave the real one unmapped, and the mapping's `Record<Address, Address>` type would not catch it.

### 6. Verify the Chain Listing

- The chain ID is unique and narrowed by `ChainUtils.isSupportedChainId`.
- Contract addresses are valid and checksummed (`pnpm lint:address`).
- `deploymentBlock` is accurate — it is the lower bound for config event scans.
- Native currency metadata is correct.
- The explorer URL is functional, including the paths built by `ChainUtils.getExplorerAddressUrl`.
- Every required base field is present, and each omitted integration is genuinely absent on the chain.
- The wrapped native token mapping is correct.
- `pnpm build` and `pnpm test` pass; the registry and address suites (`src/addresses.test.ts`, `src/chain.test.ts`, `src/registries.test.ts`) cover the new chain.

## Reporting Bugs

Open a GitHub issue with:

- Affected package and version
- `viem` version when relevant
- Chain ID
- Minimal reproduction
- Expected and actual behavior

## Reporting Security Vulnerabilities

Do not open a public issue for security reports. Follow the process in [SECURITY.md](./SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
