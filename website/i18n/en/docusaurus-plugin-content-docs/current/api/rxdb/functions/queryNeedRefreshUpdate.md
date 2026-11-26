# queryNeedRefreshUpdate()

```ts
function queryNeedRefreshUpdate<T>(task, changes, refresh_rules, recalculate_rules, readFields?): object;
```

Defined in: [packages/rxdb/src/query/need\_refresh\_update.ts:130](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/need_refresh_update.ts#L130)

Decides whether a batch of UPDATEs must go back to SQL or can take the JS incremental path.

## Type Parameters

| Type Parameter                                                                            |
| ----------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

## Parameters

| Parameter           | Type                                                                                               | Default value | Description                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| `task`              | [`QueryTask`](../classes/QueryTask.md)&lt;`T`&gt;                                                  | `undefined`   | The query task                                                                           |
| `changes`           | [`RxDBEntityLocalUpdatedEventData`](../interfaces/RxDBEntityLocalUpdatedEventData.md)&lt;`T`&gt;[] | `undefined`   | The batch of update events; may include events of relation entities                      |
| `refresh_rules`     | [`RefreshMatchRules`](../type-aliases/RefreshMatchRules.md)                                        | `undefined`   | The rule group that, when matched, goes back to SQL                                      |
| `recalculate_rules` | [`RefreshMatchRules`](../type-aliases/RefreshMatchRules.md)                                        | `undefined`   | The rule group that, when matched, takes the JS incremental path                         |
| `readFields?`       | `Iterable`&lt;`string`&gt;                                                                         | `[]`          | Entity properties the task reads beyond where / orderBy (the `parentId` of tree queries) |

## Returns

`object`

The verdict, plus the raw events partitioned by kind

### count\_boundary\_crossed

```ts
count_boundary_crossed: boolean = false;
```

### current\_entities

```ts
current_entities: (RxDBEntityLocalUpdatedEventData < T) > [];
```

### recalculate

```ts
recalculate: boolean = false;
```

### refresh

```ts
refresh: boolean = true;
```

### relation\_entities

```ts
relation_entities: (RxDBEntityLocalUpdatedEventData < T) > [];
```
