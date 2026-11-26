# producesWorkingTreeEntry()

```ts
function producesWorkingTreeEntry(callsite): boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/trusted-callsite-capture.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/trusted-callsite-capture.ts#L23)

Does this trusted path produce working tree units

## Parameters

| Parameter  | Type                                                          | Description             |
| ---------- | ------------------------------------------------------------- | ----------------------- |
| `callsite` | [`TrustedCallsite`](../../rxdb/interfaces/TrustedCallsite.md) | One row of the registry |

## Returns

`boolean`

`true` when the matrix judges it `capture`

## Remarks

The answer is computed by [classifyWriteEntrance](classifyWriteEntrance.md), not stored as a second column in the registry. A full-row write (trusted paths are all batch projection rewrites) paired with an **enabled** capability bit and a versioned target table is what these paths actually look like at runtime.
