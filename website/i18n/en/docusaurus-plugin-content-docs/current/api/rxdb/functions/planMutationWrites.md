# planMutationWrites()

```ts
function planMutationWrites<T>(mutations): EntityWriteStep<T>[];
```

Defined in: [packages/rxdb/src/system/exclusion-write-order.ts:160](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/exclusion-write-order.ts#L160)

Plans the execution order for one batch write (`mutations`).

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `mutations` | [`RxDBMutationsMap`](../interfaces/RxDBMutationsMap.md)&lt;`T`&gt; | The batch write |

## Returns

[`EntityWriteStep`](../interfaces/EntityWriteStep.md)&lt;`T`&gt;[]

The steps to execute in order

## Remarks

Entities without an exclusion range keep their original order: insert → update → delete. For entities that declare an exclusion range, deletes and updates move
before all inserts (delete → update → insert), and within updates the narrowing kind comes first (see this file's @fileoverview).

The same instance that is **both created and updated / deleted** within one batch is not moved up — moving it up would change its semantics
(updating a row that does not exist yet and then inserting would lose that update in the final state); they stay in their original positions.
