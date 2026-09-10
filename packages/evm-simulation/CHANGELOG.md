# @iris-credit/evm-simulation

## 0.1.5

### Patch Changes

- [#131](https://github.com/iris-credit/iris-sdks/pull/131) [`f42005a`](https://github.com/iris-credit/iris-sdks/commit/f42005a142e42b8b4f4d0a792e228b6192758b2f) Thanks [@madiha-right](https://github.com/madiha-right)! - Use core-sdk chain metadata when parsing WETH9 `Deposit` and `Withdrawal` logs:
  accept them only from the chain's registered `wNative` token, and retain legacy
  signature-based parsing on chains core-sdk does not know.

## 0.1.4

### Patch Changes

- [#130](https://github.com/iris-credit/iris-sdks/pull/130) [`29e3983`](https://github.com/iris-credit/iris-sdks/commit/29e398336ee641a8bbbbc4327ff311ef3b9aa33d) Thanks [@madiha-right](https://github.com/madiha-right)! - Normalize the native-ETH sentinel case-insensitively when mapping Tenderly asset changes. A sentinel carried (checksummed or otherwise non-lowercase) in `assetInfo.contractAddress` was previously `getAddress`-checksummed and no longer matched the lowercase `ethAddress` key used by `assertNoBundlerRetention`, so a retained bundler3 native residual could escape the retention gate and return a false-safe simulation. The transfer-log parser and the Tenderly asset-change mapper now share a single `normalizeAssetToken` helper, removing the drift between the two normalization paths.

## 0.1.3

### Patch Changes

- Updated dependencies [[`1b33d21`](https://github.com/iris-credit/iris-sdks/commit/1b33d21b80baa6db1db5df28427afb21c7bdb313)]:
  - @iris-credit/core-sdk@0.4.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`4477595`](https://github.com/iris-credit/iris-sdks/commit/4477595f7ba4ee56632cb3fac08323782e591fa4)]:
  - @iris-credit/core-sdk@0.3.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`bd09373`](https://github.com/iris-credit/iris-sdks/commit/bd0937332eb36f0e4aa9cd46570ab8d2471a0292), [`5fced83`](https://github.com/iris-credit/iris-sdks/commit/5fced835747c19d4367b8855afc9aa9616935fbd)]:
  - @iris-credit/iris-ts@0.1.1
  - @iris-credit/core-sdk@0.2.0

## 0.1.0

### Minor Changes

- [#73](https://github.com/iris-credit/iris-sdks/pull/73) [`e345dcf`](https://github.com/iris-credit/iris-sdks/commit/e345dcf6a1d3a266ca523f2c74054c780a62eb86) Thanks [@u-zzam](https://github.com/u-zzam)! - First versioned release of the Iris SDKs. Replaces the throwaway `0.0.<run>` publishing scheme with Changesets-based semantic versioning: per-package versions, changelogs, git tags, and GitHub releases.

### Patch Changes

- Updated dependencies [[`e345dcf`](https://github.com/iris-credit/iris-sdks/commit/e345dcf6a1d3a266ca523f2c74054c780a62eb86)]:
  - @iris-credit/core-sdk@0.1.0
  - @iris-credit/iris-ts@0.1.0
