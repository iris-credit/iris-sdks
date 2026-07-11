# @iris-credit/test

<a href="https://www.npmjs.com/package/@iris-credit/test">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@iris-credit/test?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@iris-credit/test?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/iris-credit/iris-sdks/blob/main/packages/test/LICENSE">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/@iris-credit/test?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/l/@iris-credit/test?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="MIT License">
    </picture>
</a>
<a href="https://www.npmjs.com/package/@iris-credit/test">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/@iris-credit/test?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/dm/@iris-credit/test?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Downloads per month">
    </picture>
</a>
<br />
<br />

> Forked from [`@morpho-org/test`](https://github.com/morpho-org/sdks/tree/main/packages/test), used under the MIT license.

## Overview

Viem-based package that exports utilities to build Vitest fixtures that spawn anvil forks as child processes.

Heavily inspired by [`prool`](https://github.com/wevm/prool), but lighter & faster.

## Installation

```bash
npm install @iris-credit/test
```

```bash
yarn add @iris-credit/test
```

## Usage

### Vitest (viem)

Export an extended vitest `test`:

```typescript
import { createViemTest } from "@iris-credit/test/vitest";
import { mainnet } from "viem/chains";

export const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 19_530_000,
});
```

See more on its internal usage for [viem-based E2E tests here](../core-sdk/test/).

### Spawn anvil instances

```typescript
import { spawnAnvil } from "@iris-credit/test";

spawnAnvil({ forkUrl: process.env.MAINNET_RPC_URL, forkBlockNumber: 19_750_000n });
```

## Development

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks, and package workflow. Report vulnerabilities through [SECURITY.md](../../SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
