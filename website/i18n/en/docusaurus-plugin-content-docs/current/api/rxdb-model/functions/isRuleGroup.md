# isRuleGroup()

```ts
function isRuleGroup<T>(item): item is QueryBuilderRuleGroup<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:205](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L205)

Type guard: determines whether the item is a rule group.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type                                                                                                                                                    | Description                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `item`    | \| [`QueryBuilderRule`](../type-aliases/QueryBuilderRule.md)&lt;`T`&gt; \| [`QueryBuilderRuleGroup`](../interfaces/QueryBuilderRuleGroup.md)&lt;`T`&gt; | The rule or rule group to check |

## Returns

`item is QueryBuilderRuleGroup<T>`

Returns true if it is a rule group, otherwise false.
