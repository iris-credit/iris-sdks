# @iris-credit/core-sdk

## 0.1.2

### Patch Changes

- [#88](https://github.com/iris-credit/iris-sdks/pull/88) [`0c32097`](https://github.com/iris-credit/iris-sdks/commit/0c3209750c809f552b29be60b5a836eb6fd187ab) Thanks [@madiha-right](https://github.com/madiha-right)! - Add `VenueName` (`aaveV3` | `morphoBlue`, matching the chain registries' `venues` keys) and an abstract `Venue.name` discriminant carried by every venue subclass, and tighten the registry types (`venues`, `MarketData.venue`) to it.

## 0.1.1

### Patch Changes

- [#87](https://github.com/iris-credit/iris-sdks/pull/87) [`dfe7d18`](https://github.com/iris-credit/iris-sdks/commit/dfe7d180563712f917b9c28bed6957236b17579a) Thanks [@madiha-right](https://github.com/madiha-right)! - Throw `IrisCoreErrors.ZeroBondRequirement` from `Blm.bondRequirement` when the computed requirement is zero (unconfigured token or dust debt) — such quotes are unsubmittable since `Iris.open` requires a nonzero bond requirement.

## 0.1.0

### Minor Changes

- [#73](https://github.com/iris-credit/iris-sdks/pull/73) [`e345dcf`](https://github.com/iris-credit/iris-sdks/commit/e345dcf6a1d3a266ca523f2c74054c780a62eb86) Thanks [@u-zzam](https://github.com/u-zzam)! - First versioned release of the Iris SDKs. Replaces the throwaway `0.0.<run>` publishing scheme with Changesets-based semantic versioning: per-package versions, changelogs, git tags, and GitHub releases.

### Patch Changes

- Updated dependencies [[`e345dcf`](https://github.com/iris-credit/iris-sdks/commit/e345dcf6a1d3a266ca523f2c74054c780a62eb86)]:
  - @iris-credit/iris-ts@0.1.0
