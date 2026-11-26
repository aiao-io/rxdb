---
sidebar_label: 'QueryCacheLocalReader⟨T⟩'
---

# QueryCacheLocalReader`<T>`

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L88)

The local exit on the read side of QueryCache (US-020 D8).

## Remarks

The production implementation is the entity's local `IRepository`: `where` is pushed down into SQL and entity
instances are returned. The reason it is narrowed here to an interface with only `find`, instead of depending
on `IRepository` directly: this class works by `entityName` and cannot obtain the entity class, so the type
parameter of `IRepository<T extends EntityType>` cannot be filled in at this layer.

The contract has no "not found" branch — a read failure must be thrown upwards. A cache read silently
degrading into an empty set looks to the caller exactly like "the remote really has no data", and that is the
hardest class of failure to diagnose.

## Type Parameters

| Type Parameter                    | Description          |
| --------------------------------- | -------------------- |
| <a id="type-parameter-t"></a> `T` | Entity instance type |

## Methods

### find() \{#find\}

```ts
find(options): Promise<T[]>;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L95)

Reads local rows by query conditions.

#### Parameters

| Parameter       | Type                                                                   | Description                                                                        |
| --------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `options`       | \{ `where`: [`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`T`&gt;; \} | Only `where`; `limit` / `offset` / `orderBy` are handled by the upper-layer facade |
| `options.where` | [`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`T`&gt;                 | -                                                                                  |

#### Returns

`Promise`&lt;`T`[]&gt;

The matching entity instances.
