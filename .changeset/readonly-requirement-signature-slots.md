---
"@iris-credit/iris-sdk": patch
---

Mark the `getIrisAuthorizationRequirement` parameter object and the
`SelectedRequirementSignatures` slots `readonly`, so consumers cannot mutate a
requirement input or a selected signature set in place.
