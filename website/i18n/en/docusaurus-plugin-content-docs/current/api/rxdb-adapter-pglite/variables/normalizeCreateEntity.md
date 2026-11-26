# normalizeCreateEntity

```ts
const normalizeCreateEntity: (metadata, entity) => EntityData;
```

Defined in: packages/rxdb/dist/entity/entity.utils.d.ts:161

Normalizes creation data (filters out fields that were never assigned).

## Parameters

| Parameter  | Type                                                          | Description                                 |
| ---------- | ------------------------------------------------------------- | ------------------------------------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata                             |
| `entity`   | `object`                                                      | The entity instance or data object to write |

## Returns

[`EntityData`](../../rxdb/type-aliases/EntityData.md)

The fields to write, keyed by database column name

## Throws

RxDBError when a foreign key relation is missing `columnName`

## Remarks

This is one side of the same coin as [normalizeUpdateEntity](normalizeUpdateEntity.md); two points are **deliberately** different:

1. **`readonly` is not filtered.** Columns like primary keys and `createdAt` are exactly the readonly ones; filtering them the way the update side does would leave every row without a primary key. readonly enforcement happens at the update boundary, not the create boundary.
2. **Fields are kept when their value is not `undefined`, not when `key in entity`.** With `target: es2025`, `useDefineForClassFields` is on by default, so the declaration `updatedAt!: Date` itself installs an own property with value `undefined` on the instance — the key is always present. Key-based detection would write "never assigned" into the INSERT, the adapter would normalize `undefined` to `null`, the `DEFAULT now()` clause from table creation would then never apply, and NOT NULL + DEFAULT columns would fail with a constraint error. An explicit `null` is written as usual: "no value given" and "explicitly clearing it" are two different things.

Foreign keys go through the **keyed `foreignKeyRelationMap`, not the `foreignKeyNames` / `foreignKeyColumnNames` parallel arrays paired by index**: that approach silently writes A's value into B's column whenever the two arrays differ in length. The column name is taken directly from the relation, so the pairing is guaranteed by the data structure itself. All three fields are required on `EntityMetadata`, so no `??` / `?.` is added — genuinely missing values are a metadata assembly bug that should blow up on the spot rather than masquerade as "this entity has no foreign key".

Both the SQLite family and the PGlite adapters call this function at the create boundary; audit fields such as `createdBy` / `updatedBy` are injected afterwards by the adapter under their physical column names.
