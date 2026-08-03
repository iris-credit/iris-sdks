---
"@iris-credit/core-sdk": patch
---

Throw `IrisCoreErrors.ZeroBondRequirement` from `Blm.bondRequirement` when the computed requirement is zero (unconfigured token or dust debt) — such quotes are unsubmittable since `Iris.open` requires a nonzero bond requirement.
