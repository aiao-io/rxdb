# declareTrustedWrite()

```ts
function declareTrustedWrite(scope, declaration): void;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-scope.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-scope.ts#L98)

Declares the intent of the write that immediately follows.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `scope` | `object` | The adapter instance (adapter-level primitives) or the transaction executor (in-transaction primitives) |
| `declaration` | [`TrustedWriteDeclaration`](../interfaces/TrustedWriteDeclaration.md) | The three-part identity, the same row as in the registry |

## Returns

`void`

## Throws

[RxDBError](../classes/RxDBError.md) When the three-part identity is not in [TRUSTED\_CALLSITE\_REGISTRY](../variables/TRUSTED_CALLSITE_REGISTRY.md).

## Remarks

An unregistered identity **throws rather than being passed through as an unknown entrance**: if it were passed through, adding a new bulk-rewrite callsite would only need a made-up file name to bypass the drift scan — and the scan is the entire content of SC-010. Throwing makes "add a callsite" and "update the registry" land in the same commit.

**The three-part identity is self-reported by the caller; at runtime the registry is only looked up — the caller is never verified to actually be in that file and that symbol. This is by design, not an omission.** What it stops is **drift**: a new bulk-rewrite writesite that forgot to register throws here on the spot (fail-closed). What it cannot stop is **impersonation**: a caller that fills in the three strings by copying the registry will be let through. But code that gets this far has already `import`ed the core package and obtained the adapter instance — calling `adapter.mergeChanges()` directly is easier than forging a key. This gate is not a security boundary; it is a consistency contract (epic-006 "trusted callsite registry"; the threat analysis is archived at `git show f9528e8f:specs/001-working-tree-commits/threat-model.md` §4).
