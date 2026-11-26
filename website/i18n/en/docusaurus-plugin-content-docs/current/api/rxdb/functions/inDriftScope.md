# inDriftScope()

```ts
function inDriftScope(name): boolean;
```

Defined in: [packages/rxdb/src/system/constraint-drift.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/constraint-drift.ts#L73)

Whether the name is within the comparison scope (starts with `ck_` / `uq_` / `ex_`).

## Parameters

| Parameter | Type     |
| --------- | -------- |
| `name`    | `string` |

## Returns

`boolean`

## Remarks

When reading the catalog, adapters filter by object category using **their own** prefixes (named constraints in table SQL only recognize `ck_`, indexes only `uq_`,
triggers only `ex_`); this function answers "is this name governed by the drift check".
