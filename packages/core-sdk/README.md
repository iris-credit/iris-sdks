# @iris-credit/core-sdk

<a href="https://www.npmjs.com/package/@iris-credit/core-sdk">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@iris-credit/core-sdk?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@iris-credit/core-sdk?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/iris-credit/iris-sdks/blob/main/packages/core-sdk/LICENSE">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/@iris-credit/core-sdk?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/l/@iris-credit/core-sdk?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="MIT License">
    </picture>
</a>
<a href="https://www.npmjs.com/package/@iris-credit/core-sdk">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/@iris-credit/core-sdk?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/dm/@iris-credit/core-sdk?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Downloads per month">
    </picture>
</a>
<br />
<br />

## Overview

Package that defines Iris-related entity classes, together with the viem-based fetchers that hydrate them from the chain.

- [**`Loan`**](./src/modules/loan/Loan.ts): represents the immutable terms of a loan on Iris
- [**`Position`**](./src/modules/position/Position.ts): represents the stored state of a loan's position, as of its `lastUpdate`
- [**`AccrualPosition`**](./src/modules/position/Position.ts): represents a position paired with its loan and its venue, for derived and accrued values
- [**`Venue`**](./src/modules/venue/Venue.ts): represents a venue's view of a pod — indices, price, LLTV and the pod's assets — implemented by [`MorphoBlueVenue`](./src/modules/venue/morphoBlue/MorphoBlueVenue.ts) and [`AaveV3Venue`](./src/modules/venue/aaveV3/AaveV3Venue.ts)
- [**`Blm`**](./src/modules/blm/Blm.ts): represents a BLM's bond parameters for one debt token
- [**`Config`**](./src/modules/config/Config.ts): represents the mutable protocol-level Iris configuration
- [**`Token`**](./src/modules/token/Token.ts): represents an ERC20 token
- [**`Holding`**](./src/modules/holding/Holding.ts): represents a user's balance and allowance state for one token
- [**`User`**](./src/modules/user/User.ts): represents a user of Iris

The entity math is framework-agnostic: every calculation mirrors the Iris contracts and runs offline, so positions can be projected to arbitrary timestamps without an RPC. `viem` is only needed to hydrate entities from the chain.

## Installation

```bash
npm install @iris-credit/core-sdk viem @iris-credit/iris-ts
```

```bash
yarn add @iris-credit/core-sdk viem @iris-credit/iris-ts
```

`viem` (`^2`) and [`@iris-credit/iris-ts`](../iris-ts/) are peer dependencies.

## Usage

### Augment entity classes with fetchers

Opt in class augmentation to fetch an entire entity of the Iris ecosystem using viem. `./augment` is the single entry point: importing it attaches a `fetch` static to every entity.

```typescript
import "@iris-credit/core-sdk/augment";
```

Augmentation is entirely optional — every fetcher is also exported standalone from the package root:

| Entity            | Augmented static                                                          | Standalone fetcher     |
| ----------------- | ------------------------------------------------------------------------- | ---------------------- |
| `Config`          | `Config.fetch(client)`                                                    | `fetchConfig`          |
| `Loan`            | `Loan.fetch(pod, client)`                                                 | `fetchLoan`            |
| `Position`        | `Position.fetch(pod, client)`                                             | `fetchPosition`        |
| `AccrualPosition` | `AccrualPosition.fetch(pod, client)`                                      | `fetchAccrualPosition` |
| `Venue`           | `Venue.fetch({ pod, venueId, data, collateralToken, debtToken }, client)` | `fetchVenue`           |
| `Blm`             | `Blm.fetch(blm, token, client)`                                           | `fetchBlm`             |
| `Token`           | `Token.fetch(address, client)`                                            | `fetchToken`           |
| `Holding`         | `Holding.fetch(user, token, client)`                                      | `fetchHolding`         |
| `User`            | `User.fetch(address, client)`                                             | `fetchUser`            |

Every fetcher takes optional `{ blockNumber, blockTag, stateOverride, chainId }` parameters for historical or state-overridden reads.

### Instance of the immutable terms of a specific loan

Leverage the [`Loan`](./src/modules/loan/Loan.ts) class to manipulate a given loan's immutable terms:

```typescript
import { Loan } from "@iris-credit/core-sdk";

const loan = new Loan({
  pod: "0x1111111111111111111111111111111111111111",
  borrower: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  solver: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  collateralToken: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", // cbBTC
  debtToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
  venueBitmap: 0b11n, // aaveV3 (id 0) & morphoBlue (id 1).
  maturity: 1790000000n,
  overduePeriod: 604800n, // 7 days.
  fixedRate: 5_0000000000000000n, // 5% annual.
  overdueRate: 10_0000000000000000n, // +10% annual past maturity.
  bondLltv: 90_0000000000000000n, // 90%.
  fee: 0n,
});

loan.bondLif; // 5_0000000000000000n (5%, capped at MAX_BOND_LIF).
loan.liquidatableAt; // 1790604801n (maturity + overduePeriod + 1).
loan.isVenueAllowed(1n); // true.
```

### Instance of a specific venue

Leverage the [`Venue`](./src/modules/venue/Venue.ts) implementations to manipulate the venue backing a loan. Each one carries the venue's own rate model, so its indices can be projected offline:

```typescript
import {
  ChainId,
  MathLib,
  MorphoBlueVenue,
  getChainRegistry,
  getMarketData,
} from "@iris-credit/core-sdk";
import { Time } from "@iris-credit/iris-ts";

const { venues } = getChainRegistry(ChainId.EthMainnet);

const venue = new MorphoBlueVenue(
  {
    id: venues.morphoBlue, // 1n
    // The cbBTC/USDC abi.encode(MarketParams) payload, looked up by its Morpho market id.
    data: getMarketData(ChainId.EthMainnet, marketId).data,
    pod: "0x1111111111111111111111111111111111111111",
    collateral: 1_00000000n, // 1 cbBTC.
    debt: 50_000_000000n, // 50k USDC.
    collateralIndex: MathLib.RAY,
    debtIndex: MathLib.RAY,
    lltv: 86_0000000000000000n, // 86%.
    price: 1_000000000000000000000000000000000000000n, // 100k USDC per cbBTC (scaled by ORACLE_PRICE_SCALE).
    lastUpdate: 1785000000n,
  },
  {
    totalSupplyAssets: 10_000_000_000000n,
    totalBorrowAssets: 8_000_000_000000n,
    totalBorrowShares: 8_000_000_000000_000000n,
    lastUpdate: 1785000000n,
  },
  { borrowShares: 50_000_000000_000000n, collateral: 1_00000000n },
  1268391679n, // rateAtTarget (per second, scaled by WAD), when the market uses the Adaptive Curve IRM.
);

venue.utilization; // 80_0000000000000000n (80%).
venue.isHealthy; // true.
venue.healthFactor; // 1_720000000000000000n (1.72, scaled by WAD).

const accruedVenue = venue.accrueInterest(Time.timestamp()); // Project the indices with the venue's own rate model.

accruedVenue.debt; // e.g. 50_121_741440n (in debt assets, 30 days in).
```

> [!NOTE]
> Venue fields are live onchain observations and must come from the block being evaluated. Position math composed with stale venue data (old indices, an old price) silently diverges from Iris's onchain results.

### Instance of the position of a specific loan

Leverage the [`AccrualPosition`](./src/modules/position/Position.ts) class to manipulate a loan's position, paired with its loan and its venue:

```typescript
import { AccrualPosition, Position } from "@iris-credit/core-sdk";
import { Time } from "@iris-credit/iris-ts";

const position = new AccrualPosition(
  new Position({
    pod: loan.pod,
    collateral: 1_00000000n, // 1 cbBTC.
    debt: 50_000_000000n, // 50k USDC.
    bond: 5_000_000000n, // 5k USDC.
    bondRequirement: 5_000_000000n,
    collateralIndex: MathLib.RAY,
    debtIndex: MathLib.RAY,
    fixedLeg: 0n,
    floatingLeg: 0n,
    surplus: 0n,
    lastUpdate: 1785000000n,
    venueId: venue.id,
    data: venue.data,
  }),
  loan,
  venue,
);

position.isHealthy; // true.
position.isHealthyVenue; // true.
position.isHealthyBond; // true.
position.repayAmount; // 50_396_372399n (in debt assets: the fixed term settles in full).
position.withdrawableCollateral; // 41232316n (in collateral assets, i.e. 0.41 cbBTC).

const accrued = position.accrueLegs(Time.timestamp()); // Accrue the legs (and the venue) to the latest's timestamp.

accrued.fixedLeg; // e.g. 205_479452n (in debt assets, 30 days in).
accrued.floatingLeg; // e.g. 121_741439n (in debt assets, 30 days in).
accrued.drawdown; // e.g. 0n (the solver is up, scaled by WAD).
```

Onchain operations are mirrored as pure transitions returning a new position — `repay`, `liquidate`, `liquidateBond`, `supplyCollateral`, `withdrawCollateral`, `supplyBond`, `withdrawBond` and `refinance` — each accruing and rebasing exactly as Iris does:

```typescript
const { position: repaid, repaid: debtAssets } = position.repay(Time.timestamp());

debtAssets; // e.g. 50_396_372399n (pulled from the payer, in debt assets).
repaid.bondRequirement; // 0n (the loan is resolved).
```

### Fetch the position of a specific loan

Leverage the [`AccrualPosition`](./src/modules/position/Position.ts) class to fetch a loan's position, its loan and its venue in one call:

```typescript
// /!\ Import AccrualPosition from the augmentation entry point (or simply import the file)
import { AccrualPosition } from "@iris-credit/core-sdk/augment";
import { Time } from "@iris-credit/iris-ts";

const position = await AccrualPosition.fetch(
  "0x1111111111111111111111111111111111111111", // pod address.
  client, // viem client.
);

position.loan.maturity; // e.g. 1790000000n.
position.venue.lltv; // e.g. 86_0000000000000000n (86%).
position.isLiquidatable; // e.g. false.

const accrued = position.accrueLegs(Time.timestamp()); // Accrue interest to the latest's timestamp.

accrued.repayAmount; // e.g. 50_396_372399n (in debt assets).
```

### Fetch the venue backing a loan

Leverage the [`Venue`](./src/modules/venue/Venue.ts) class to fetch the venue's live view of a pod, hydrated with the rate model matching its venue adapter:

```typescript
import { Venue } from "@iris-credit/core-sdk/augment";

const venue = await Venue.fetch(
  {
    pod: position.pod,
    venueId: position.venueId,
    data: position.data,
    collateralToken: loan.collateralToken,
    debtToken: loan.debtToken,
  },
  client, // viem client.
);

venue.collateral; // e.g. 1_00000000n (in collateral assets).
venue.debt; // e.g. 50_000_000000n (in debt assets).
venue.price; // e.g. 100k USDC per cbBTC (scaled by ORACLE_PRICE_SCALE), or undefined when unknown.
```

### Fetch a BLM's bond requirement

Leverage the [`Blm`](./src/modules/blm/Blm.ts) class to compute the bond a quote requires, without a `bondRequirement` contract call:

```typescript
import { Blm } from "@iris-credit/core-sdk/augment";
import { Time } from "@iris-credit/iris-ts";

const blm = await Blm.fetch(
  "0x8cc058689674f0b54820a04b47618df45d04cBcb", // e.g. quote.blm.
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC, the quote's debt token.
  client, // viem client.
);

blm.bondRequirement({ debt: 50_000_000000n, duration: Time.s.from.d(30n) }); // e.g. 2_500_000000n (in debt assets).
```

A BLM's `whitelist` is offline data (e.g. from the indexer), attached after fetching — `blm.whitelist = whitelist` — and checked with `blm.isWhitelisted(account)`. `fetchIsWhitelisted` is the authoritative onchain check.

### Fetch the protocol configuration

Leverage the [`Config`](./src/modules/config/Config.ts) class to fetch the mutable protocol-level configuration, snapshotted into loans at `take`:

```typescript
import { Config } from "@iris-credit/core-sdk/augment";

const config = await Config.fetch(client);

config.fee; // e.g. 10_0000000000000000n (10%, WAD-scaled from the contract's BP-compressed value).
config.feeRecipient; // e.g. 0x....
```

### Fetch a user's holding

Leverage the [`Holding`](./src/modules/holding/Holding.ts) class to fetch a user's balance and Iris-related allowances for one token:

```typescript
import { Holding } from "@iris-credit/core-sdk/augment";

const holding = await Holding.fetch(
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC, or NATIVE_ADDRESS for the native asset.
  client, // viem client.
);

holding.balance; // e.g. 100_000_000000n (in token assets).
holding.erc20Allowances.iris; // e.g. 0n.
holding.permit2IrisAllowance; // e.g. { amount: 0n, expiration: 0n, nonce: 0n }.
```

### Sign Iris typed data

The [`signatures`](./src/signatures/) module builds the EIP-712 payloads Iris expects, ready to pass to viem's `signTypedData`:

```typescript
import { ChainId, getQuoteTypedData } from "@iris-credit/core-sdk";

const signature = await walletClient.signTypedData(getQuoteTypedData(ChainId.EthMainnet, quote));
```

- `getQuoteTypedData(chainId, quote)`: a solver's [`Quote`](./src/signatures/quote.ts), consumed by `take`
- `getAuthorizationTypedData(chainId, authorization)`: an [`Authorization`](./src/signatures/authorization.ts) granting or revoking a manager on Iris
- `getPermitTypedData(args, chainId)`: an ERC-2612 [permit](./src/signatures/permit.ts), with the token's `nonce` carried in `args`
- `getPermit2PermitTypedData(args, chainId)`: a [Permit2](./src/signatures/permit2.ts) allowance (`PermitSingle`)
- `getPermit2TransferFromTypedData(args, chainId)`: a [Permit2](./src/signatures/permit2.ts) signature transfer (`PermitTransferFrom`)

ERC-2612 domains are curated per chain: [`SIMPLE_PERMIT_TOKENS`](./src/signatures/permit.ts) records the tokens whose permit is verified against the live deployment and the EIP-712 domain `version` each one signs — read via `getSimplePermitTokens(chainId)` or `getPermitDomainVersion(token, chainId)`. `getPermitTypedData` takes its `version` from there, falling back to the `"1"` most ERC-2612 tokens sign.

### Addresses & registries

Two static, per-chain sources, both narrowed to the exact chain by their getter:

- [`CHAIN_ADDRESSES`](./src/addresses.ts) — what is **deployed**: Iris core contracts, bundler adapters, venue adapters and common tokens
- [`CHAIN_REGISTRIES`](./src/registries.ts) — what is **enabled** on the Iris contract: BLMs, venue ids, accepted bond LLTVs, and the market data payloads (recorded as preimages keyed by their enabled `keccak256(data)` hash — the Morpho market id for Morpho Blue payloads — since the contract only stores the hash)

```typescript
import { ChainId, getChainAddresses, getChainRegistry, getMarketData } from "@iris-credit/core-sdk";

const { iris, blm, morphoBlueAdapter, tokens } = getChainAddresses(ChainId.EthMainnet);
const { venues, bondLltvs } = getChainRegistry(ChainId.EthMainnet);

venues.morphoBlue; // 1n
bondLltvs; // [90_0000000000000000n] (90%).
// The enabled abi.encode(MarketParams) payload for a Morpho market id (or any enabled
// `keccak256(data)` hash); throws `UnknownDataHashError` when not recorded.
getMarketData(ChainId.EthMainnet, marketId).data;
```

Enablement is append-only onchain, so registry entries can only ever be stale-incomplete — never stale-wrong. Solvers can therefore quote from the registry offline, while the fetchers re-verify mutable state (BLM params, whitelist entries, fee) at runtime.

> [!NOTE]
> Both sources are compile-time constants — there is no runtime registration — so supporting a new chain means adding an entry to [`addresses.ts`](./src/addresses.ts) and [`registries.ts`](./src/registries.ts). Fetchers that resolve a contract from the registry throw `UnsupportedChainIdError` on an unknown chain; those taking an explicit address (`fetchBlm`, `fetchIsWhitelisted`) never read the registry and so never throw it. Narrow untrusted ids with `ChainUtils.isSupportedChainId`.

## Development

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks, and package workflow. Report vulnerabilities through [SECURITY.md](../../SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
