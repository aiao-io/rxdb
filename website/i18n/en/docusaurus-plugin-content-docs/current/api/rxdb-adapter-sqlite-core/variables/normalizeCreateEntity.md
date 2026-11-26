# normalizeCreateEntity

```ts
const normalizeCreateEntity: (metadata, entity) => EntityData;
```

Defined in: packages/rxdb/dist/entity/entity.utils.d.ts:161

Normalizes create data (filters out unassigned fields).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `entity` | `object` | Entity instance or data object to write |

## Returns

[`EntityData`](../../rxdb/type-aliases/EntityData.md)

Fields to write, keyed by database column name

## Throws

RxDBError when a foreign key relation lacks `columnName`

## Remarks

Two sides of the same thing as [normalizeUpdateEntity](normalizeUpdateEntity.md), with two points **deliberately** different:

1. **Does not filter `readonly`.** Columns like the primary key and `createdAt` are exactly the readonly ones; filtering by the update side's standard would leave
   every row without a primary key. The readonly enforcement point is at the update boundary, not the create boundary.
2. **Decides by "value is not `undefined`", not by `key in entity`.** Under `target: es2025`
   `useDefineForClassFields` is on by default, and a field declaration like `updatedAt!: Date` itself installs an own property
   with the value `undefined` on the instance, so the key is always present. Deciding by key means writing "not assigned" into the INSERT too, and the adapter then
   normalizes `undefined` into `null` — the `DEFAULT now()` clause at table creation never takes effect, and a NOT NULL + DEFAULT
   column errors with a constraint violation directly. An explicit `null` is written as usual: "no value given" and "clear it on purpose" are two different things.

Foreign keys go through the keyed `foreignKeyRelationMap`, not the two parallel arrays `foreignKeyNames` / `foreignKeyColumnNames`
paired by index: that style silently writes A's value into B's column as soon as the two sides differ in length.
Column names are taken directly from the relation; the pairing is guaranteed by the data structure itself. All three fields are required on `EntityMetadata`,
so no `??` / `?.` is added — a genuinely empty value is a metadata assembly bug; let it blow up on the spot rather than masquerading as "this entity has no foreign key".

Both the SQLite family and the PGlite adapters call this function at the create boundary; audit fields like `createdBy` / `updatedBy`
are injected separately by the adapter by physical column name after this point.
