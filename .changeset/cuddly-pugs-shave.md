---
"@iris-credit/test": patch
---

Annotate `createViemTest` with an explicit `TestAPI<ViemTestContext<chain>>` return type so the emitted declaration references the exported `ViemTestContext` interface instead of an inlined anonymous context shape.
