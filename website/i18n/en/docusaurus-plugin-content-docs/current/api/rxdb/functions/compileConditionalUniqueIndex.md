# compileConditionalUniqueIndex()

```ts
function compileConditionalUniqueIndex(metadata, index): CompiledConditionalUniqueIndex;
```

Defined in: [packages/rxdb/src/entity/conditional-unique-index.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/conditional-unique-index.ts#L64)

Compiles a conditional unique index.

## Parameters

| Parameter  | Type                                                                        | Description                                            |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md)                       | The entity metadata produced by `transitionMetadata()` |
| `index`    | [`EntityIndexMetadataOptions`](../interfaces/EntityIndexMetadataOptions.md) | The index that declares `where`                        |

## Returns

[`CompiledConditionalUniqueIndex`](../interfaces/CompiledConditionalUniqueIndex.md)

The deterministic index name, physical columns and where predicate

## Throws

[RxDBError](../classes/RxDBError.md) when there is no `unique`, a column does not exist, the where is not within the single-row whitelist,
the index `name` does not match `[a-z][a-z0-9_]*` or the full name exceeds 63 bytes (AC#9 / AC#15)
