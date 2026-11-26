# isRule()

```ts
function isRule<T>(item): item is QueryBuilderRule<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:215](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L215)

Type guard: determines whether the item is a rule.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type                                                                                                                                                    | Description                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `item`    | \| [`QueryBuilderRule`](../type-aliases/QueryBuilderRule.md)&lt;`T`&gt; \| [`QueryBuilderRuleGroup`](../interfaces/QueryBuilderRuleGroup.md)&lt;`T`&gt; | The rule or rule group to check |

## Returns

`item is QueryBuilderRule<T>`

Returns true if it is a rule, otherwise false.
