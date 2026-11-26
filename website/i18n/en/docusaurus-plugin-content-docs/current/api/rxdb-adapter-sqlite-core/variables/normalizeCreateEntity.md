# normalizeCreateEntity

```ts
const normalizeCreateEntity: (metadata, entity) => EntityData;
```

Defined in: packages/rxdb/dist/entity/entity.utils.d.ts:161

Normalizes creation data (filters out unassigned fields).

## Parameters

| Parameter  | Type                                                          | Description                                      |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata                                  |
| `entity`   | `object`                                                      | The entity instance or data object to be written |

## Returns

[`EntityData`](../../rxdb/type-aliases/EntityData.md)

Fields to be written, keyed by database column name

## Throws

RxDBError When a foreign key relation lacks a `columnName`

## Remarks

This is the other side of the same coin as [normalizeUpdateEntity](normalizeUpdateEntity.md), with two **deliberate** differences:

1. **Does not filter `readonly`.** Columns such as the primary key and `createdAt` are exactly the readonly ones; filtering by the update-side rule would leave
   every row missing its primary key. The enforcement point of readonly is the update boundary, not the create boundary.
2. **Judged by "value is not `undefined`", not by `key in entity`.** Under `target: es2025`,
   `useDefineForClassFields` is on by default; the field declaration `updatedAt!: Date` itself installs an own property
   with value `undefined` on the instance, so the key is always present. Judging by key presence would write "unassigned" into the INSERT too, and the adapter would then
   normalize `undefined` to `null` — the `DEFAULT now()` clause at table creation would never take effect, and NOT NULL + DEFAULT
   columns would fail with a constraint error directly. An explicit `null` is written as usual: "not given a value" and "deliberately clearing it" are two different things.

Foreign keys **go through the keyed `foreignKeyRelationMap`, not the two parallel arrays `foreignKeyNames` / `foreignKeyColumnNames` paired by index**:
that style silently writes A's value into B's column whenever the two arrays differ in length, with no error at all.
Column names are taken directly from the relation, so pairing is guaranteed by the data structure itself. All three fields are required on `EntityMetadata`,
so no `??` / `?.` is added — if they are really empty it is a metadata assembly bug; let it blow up on the spot rather than masquerading as "this entity has no foreign keys".

Both the SQLite family and the PGlite adapter call this function at the create boundary; audit fields such as `createdBy` / `updatedBy`
are injected separately by the adapter by physical column name after that.
