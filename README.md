# Iris SDKs

<p align="center"><i>A collection of Software Development Kits to ease interactions with the Iris credit protocol.</i></p>
<br />

> Portions of this repository are forked from Morpho's [sdks](https://github.com/morpho-org/sdks) (e.g. `iris-ts` from [`morpho-ts`](https://github.com/morpho-org/sdks/tree/main/packages/morpho-ts)), used under the MIT license.

## Getting Started

### [`@iris-credit/iris-sdk`](./packages/iris-sdk/) — the recommended entry point

**Start here.** `@iris-credit/iris-sdk` is the abstraction layer that simplifies the Iris protocol: it builds ready-to-send transactions for the Iris protocol.

---

### Secondary packages

The packages below are lower-level building blocks. Use them only if `@iris-credit/iris-sdk` does not cover your use case. `@iris-credit/iris-sdk` is the single recommended entry point for all integrations, including read-only ones — it covers both reads and transaction building, and long term is the package we converge on (with tree-shaking and dedicated export paths so read-only consumers don't pay for the transaction-building surface).

#### Development

- [**`@iris-credit/core-sdk`**](./packages/core-sdk/): Package that defines Iris-related entity classes (such as `Token`, `Loan`, `Position`) along with viem-based fetchers exposed through the `./augment` entry point — the equivalent of Morpho's `blue-sdk` and `blue-sdk-viem` combined

- [**`@iris-credit/iris-ts`**](./packages/iris-ts/): TypeScript package to handle all things time & format-related

- [**`@iris-credit/evm-simulation`**](./packages/evm-simulation/): EVM bundle simulation engine — execution preview via `eth_simulateV1`, transfer parsing, per-account asset changes, and a bundler3 retention guard — the equivalent of Morpho's `evm-simulation` (without the Tenderly backend)

### Testing

- [**`@iris-credit/test`**](./packages/test/): Viem-based package that exports utilities to build Vitest fixtures that spawn anvil forks as child processes

## Developer

### Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup and contribution workflow.

### Security

See [SECURITY.md](./SECURITY.md) for vulnerability reporting and supported security scope.

## Debugging

Here's a tutorial on how to link a specific package to debug at runtime:

1. From the repository in which you want to link the package: `pnpm link ../your/relative/path/to/iris-sdks/packages/core-sdk`

```diff
-    "@iris-credit/core-sdk": "0.0.0",
+    "@iris-credit/core-sdk": "link:../../../iris-sdks/packages/core-sdk",
```

2. Modify `core-sdk` [package.json](./packages/core-sdk/package.json) to use js main & js files:

```diff
-  "main": "src/index.ts",
+  "main": "lib/esm/index.js",
+  "types": "lib/esm/index.d.ts"
```

3. In a separate process, start: `pnpm --dir packages/core-sdk build --watch`

## Authors

- [@u-zzam](https://github.com/u-zzam)
- [@madiha-right](https://github.com/madiha-right) ([Twitter](https://x.com/madiha_right))

## License

MIT — see [LICENSE](/LICENSE).
