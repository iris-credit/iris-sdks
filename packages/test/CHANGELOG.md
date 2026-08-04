# @iris-credit/test

## 0.1.1

### Patch Changes

- [#90](https://github.com/iris-credit/iris-sdks/pull/90) [`c9ec1b2`](https://github.com/iris-credit/iris-sdks/commit/c9ec1b2a4816a4801f828cf31a6eacade002dac6) Thanks [@madiha-right](https://github.com/madiha-right)! - Annotate `createViemTest` with an explicit `TestAPI<ViemTestContext<chain>>` return type so the emitted declaration references the exported `ViemTestContext` interface instead of an inlined anonymous context shape.

## 0.1.0

### Minor Changes

- [#73](https://github.com/iris-credit/iris-sdks/pull/73) [`e345dcf`](https://github.com/iris-credit/iris-sdks/commit/e345dcf6a1d3a266ca523f2c74054c780a62eb86) Thanks [@u-zzam](https://github.com/u-zzam)! - First versioned release of the Iris SDKs. Replaces the throwaway `0.0.<run>` publishing scheme with Changesets-based semantic versioning: per-package versions, changelogs, git tags, and GitHub releases.
