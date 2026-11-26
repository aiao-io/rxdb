# declaresStorageConstraints()

```ts
function declaresStorageConstraints(metadata): boolean;
```

Defined in: [packages/rxdb/src/system/constraint-drift.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/constraint-drift.ts#L83)

Whether the entity declares any declarative storage constraints (CHECK / conditional unique index / range exclusion, including inherited ones).

## Parameters

| Parameter  | Type                                                  |
| ---------- | ----------------------------------------------------- |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) |

## Returns

`boolean`

## Remarks

Both the capability judgment (AC#6: an adapter without drift checking reports unsupported) and the SQLite host version threshold (AC#7) rely on it: applications that declare nothing are unaffected by either gate.
