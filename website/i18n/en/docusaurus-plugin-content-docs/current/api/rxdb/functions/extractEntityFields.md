# ~~Function: extractEntityFields()~~

```ts
function extractEntityFields(metadata): EntityFieldConfig[];
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L125)

## Parameters

| Parameter  | Type                                                  |
| ---------- | ----------------------------------------------------- |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) |

## Returns

[`EntityFieldConfig`](../interfaces/EntityFieldConfig.md)[]

## Deprecated

Use [describeEntityFields](describeEntityFields.md) instead. This function cannot see `1:m` / `m:n` relations,
and does not output `encrypted` / `format` / `sortable` / `searchable`.
