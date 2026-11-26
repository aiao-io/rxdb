# normalizeCreateEntity()

```ts
function normalizeCreateEntity(metadata, entity): EntityData;
```

Defined in: [packages/rxdb/src/entity/entity.utils.ts:361](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.utils.ts#L361)

Normalizes creation data (filtering out unassigned fields).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | The entity metadata |
| `entity` | `object` | The entity instance or data object to be written |

## Returns

[`EntityData`](../type-aliases/EntityData.md)

The fields to write, keyed by database column name

## Throws

[RxDBError](../classes/RxDBError.md) when a foreign key relation is missing `columnName`

## Remarks

The two sides of the same thing as [normalizeUpdateEntity](normalizeUpdateEntity.md), with two points **deliberately** different:

1. **Does not filter `readonly`.** Columns like the primary key and `createdAt` are readonly by definition; filtering by the update side's rule would leave
   every row without a primary key. The enforcement point for readonly is at the update boundary, not the creation boundary.
2. **Judges by "value is not `undefined`", not by `key in entity`.** Under `target: es2025`,
   `useDefineForClassFields` is on by default; a field declaration like `updatedAt!: Date` itself installs an own property with value `undefined` on the instance, so the key is always present.
   Judging by key presence is equivalent to writing "not assigned" into the INSERT as well, and the adapter then normalizes
   `undefined` to `null` — the `DEFAULT now()` clause in the table definition thus never takes effect, and NOT NULL + DEFAULT
   columns fail with a constraint error right away. An explicit `null` is written as usual: "no value given" and "explicitly clear it" are two different things.

Foreign keys **go through the keyed `foreignKeyRelationMap`, not the two parallel arrays `foreignKeyNames` / `foreignKeyColumnNames` paired by index**:
that style would write A's value into B's column the moment the two sides differ in length, and completely silently.
Column names are taken directly from the relation, with the pairing guaranteed by the data structure itself. All three fields are required on `EntityMetadata`,
so no `??` / `?.` is added — genuinely empty values are a metadata assembly bug; let it explode on the spot rather than masquerading as "this entity has no foreign keys".

Both the SQLite-family and PGlite adapters call this function at the creation boundary; audit fields like `createdBy` / `updatedBy`
are injected separately by the adapter under their physical column names after this point.
