# VersionedTransactionGuard

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:170](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L170)

The guard against mixing QueryCache / other entities within one transaction unit.

## Remarks

Only two sides exist: QueryCache entities, and all other entities (versioned entities and entities with the change log disabled). Mixing is rejected because the write paths are irreconcilable — QueryCache writes the remote side first and then persists a disposable cache, while the rest write local transactions — whereas entities with the change log disabled share the local transaction, commit and rollback with versioned entities, so mixing those has no such problem. The core's `isQueryCacheBatch` splits along the same line.

**Streaming, not future-knowing**: if mixing only shows up at the 5th operation, it throws at the 5th, and the first 4 return normally. Requiring the guard to know in advance that a cache entity will be written later is the same as requiring callers to pre-declare the whole transaction's operation set — scenario 7 of spec.md explicitly rules that premise out.

## Methods

### record() \{#record\}

```ts
record(entityName): void;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:177](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L177)

Records one entity operation within this transaction

#### Parameters

| Parameter    | Type     | Description                     |
| ------------ | -------- | ------------------------------- |
| `entityName` | `string` | The name of the operated entity |

#### Returns

`void`

#### Throws

[MixedVersionedCacheTransactionError](../classes/MixedVersionedCacheTransactionError.md) when this registration makes the transaction contain both QueryCache and other entities
