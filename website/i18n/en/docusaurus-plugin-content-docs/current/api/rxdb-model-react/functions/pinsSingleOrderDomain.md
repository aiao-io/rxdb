# pinsSingleOrderDomain()

```ts
function pinsSingleOrderDomain(groupFields, fixedQuery): boolean;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:44

Whether the fixed query pins exactly one complete ordering domain

## Parameters

| Parameter     | Type                                                               | Description                           |
| ------------- | ------------------------------------------------------------------ | ------------------------------------- |
| `groupFields` | readonly `string`[]                                                | The entity's declared grouping fields |
| `fixedQuery`  | [`ListFixedQuery`](../interfaces/ListFixedQuery.md) \| `undefined` | The list's fixed query                |

## Returns

`boolean`

Whole-table ordering requires no fixed conditions; grouped ordering requires exactly one equality (or `null`) condition per grouping field
