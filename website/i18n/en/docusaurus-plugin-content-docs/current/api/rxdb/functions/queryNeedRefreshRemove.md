# queryNeedRefreshRemove()

```ts
function queryNeedRefreshRemove<T>(
   task, 
   changes, 
   refresh_rules, 
   recalculate_rules
): object;
```

Defined in: [packages/rxdb/src/query/need\_refresh\_remove.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/need_refresh_remove.ts#L24)

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `task` | [`QueryTask`](../classes/QueryTask.md)&lt;`T`&gt; |
| `changes` | [`RxDBEntityLocalRemovedEventData`](../interfaces/RxDBEntityLocalRemovedEventData.md)&lt;`T`&gt;[] |
| `refresh_rules` | [`RefreshMatchRules`](../type-aliases/RefreshMatchRules.md) |
| `recalculate_rules` | [`RefreshMatchRules`](../type-aliases/RefreshMatchRules.md) |

## Returns

### current\_entities

```ts
current_entities: RxDBEntityLocalRemovedEventData<T>[];
```

### recalculate

```ts
recalculate: boolean;
```

Whether JS recalculation is possible

### refresh

```ts
refresh: boolean;
```

Whether an SQL refresh is needed

### relation\_entities

```ts
relation_entities: RxDBEntityLocalRemovedEventData<T>[];
```
