# pinsSingleOrderDomain()

```ts
function pinsSingleOrderDomain(groupFields, fixedQuery): boolean;
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L70)

Whether the fixed query pins exactly one complete ordering domain.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `groupFields` | readonly `string`[] | The grouping fields declared by the entity |
| `fixedQuery` | [`ListFixedQuery`](../interfaces/ListFixedQuery.md) \| `undefined` | The list's fixed query |

## Returns

`boolean`

Whole-table ordering requires no fixed conditions; grouped ordering requires exactly one equality (or `null`) condition per grouping field.
