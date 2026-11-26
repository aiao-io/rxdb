# isRule()

```ts
function isRule<T>(item): item is QueryBuilderRule<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:183

Type guard: determines whether the item is a rule

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type                                                                                                                                                    | Description                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `item`    | \| [`QueryBuilderRule`](../type-aliases/QueryBuilderRule.md)&lt;`T`&gt; \| [`QueryBuilderRuleGroup`](../interfaces/QueryBuilderRuleGroup.md)&lt;`T`&gt; | The rule or rule group to test |

## Returns

`item is QueryBuilderRule<T>`

Returns true if it is a rule, otherwise false
