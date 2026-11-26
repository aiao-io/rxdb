# ~~Function: extractSystemFields()~~

```ts
function extractSystemFields(metadata): EntityFieldConfig[];
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:154](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L154)

## Parameters

| Parameter  | Type                                                  |
| ---------- | ----------------------------------------------------- |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) |

## Returns

[`EntityFieldConfig`](../interfaces/EntityFieldConfig.md)[]

## Deprecated

Use [describeEntityFields](describeEntityFields.md) instead: system fields are mixed into the same table with `source: 'system'`.
This function hardcodes the primary key as `id` / `uuid` / `readonly: true`,
and errors out directly when the primary key has another name or is declared writable.
