---
sidebar_label: 'GraphWhere⟨T⟩'
---

# GraphWhere`<T>`

```ts
type GraphWhere<T> = RuleGroup<InstanceType<T>> | Partial<Record<Extract<keyof InstanceType<T>, string>, unknown>>;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L26)

Node filter conditions for graph queries

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Remarks

Only supports fields of the current entity table (simple key-value matching or a RuleGroup), **relation fields are not supported**; use a plain find query when relation filtering is needed
