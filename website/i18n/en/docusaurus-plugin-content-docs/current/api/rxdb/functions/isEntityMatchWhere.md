# isEntityMatchWhere()

```ts
function isEntityMatchWhere<T>(entity, ruleGroup): boolean;
```

Defined in: [packages/rxdb/src/query/query-matching.utils.ts:398](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/query-matching.utils.ts#L398)

Determines whether an entity matches a rule group.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter   | Type                                                   | Description                                                                                             |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `entity`    | `object` \| `null` \| `undefined`                      | The entity to judge; `null` / `undefined` (the inversePatch of INSERT, the patch of DELETE) never match |
| `ruleGroup` | [`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`T`&gt; | The rule group                                                                                          |

## Returns

`boolean`

`true` on a match

## Remarks

Same semantics as the SQL side's `WHERE` evaluation (an empty `and` group matches everything, an empty `or` group also matches everything),
so it can recompute in memory the filters the adapter would otherwise have pushed down to SQL.

## Throws

RxDBError when evaluation reaches an unrecognizable condition (such as an uppercase combinator), with the condition's original text in the error; short-circuited ones do not throw
