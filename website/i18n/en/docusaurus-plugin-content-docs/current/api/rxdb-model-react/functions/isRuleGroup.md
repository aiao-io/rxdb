# isRuleGroup()

```ts
function isRuleGroup<T>(item): item is QueryBuilderRuleGroup<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:176

Type guard: determines whether the item is a rule group

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `item` | \| [`QueryBuilderRule`](../type-aliases/QueryBuilderRule.md)&lt;`T`&gt; \| [`QueryBuilderRuleGroup`](../interfaces/QueryBuilderRuleGroup.md)&lt;`T`&gt; | The rule or rule group to check |

## Returns

`item is QueryBuilderRuleGroup<T>`

Returns true if it is a rule group, false otherwise
