---
"@iris-credit/iris-sdk": minor
---

Expose the EIP-712 payload of every signature `Requirement` as `action.typedData`, so integrators can inspect or display the exact typed data before it is signed by the built-in `Requirement.sign(client, userAddress)`.

Each signable requirement action — ERC-2612 permit (`PermitAction`), Permit2 AllowanceTransfer (`Permit2Action`), and Iris authorization (`AuthorizationAction`) — now carries a deep-frozen `typedData` field holding the exact viem `TypedDataDefinition` that `sign()` signs. On the `Requirement` returned by the requirement helpers the field is typed as required (`RequirementTypedData`); it stays optional on the standalone action interfaces so hand-built action metadata need not supply it.

**Breaking:** because the permit and authorization payloads embed the owner and are now built when the requirement is created, `encodeErc20Permit` and `encodeIrisSignatureAuthorization` take a new required `owner` parameter (and `getGeneralAdapterRequirementsPermit` forwards it). Their `sign()` now rejects a `userAddress` that differs from `owner` with `AddressMismatchError`. The entity and requirement helpers already supply the owner, so high-level flows are unaffected.
