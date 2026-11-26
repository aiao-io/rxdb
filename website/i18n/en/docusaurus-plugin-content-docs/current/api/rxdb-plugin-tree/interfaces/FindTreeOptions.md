---
sidebar_label: 'FindTreeOptions⟨T, WhereType⟩'
---

# FindTreeOptions`<T, WhereType>`

Defined in: [rxdb-plugin-tree/src/repository/tree-repository.interface.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/repository/tree-repository.interface.ts#L6)

Tree query configuration

## Type Parameters

| Type Parameter                                                                                    | Default type                                                                         |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) | [`EntityType`](../../rxdb/type-aliases/EntityType.md)                                |
| <a id="type-parameter-wheretype"></a> `WhereType`                                                 | [`RuleGroup`](../../rxdb/type-aliases/RuleGroup.md)&lt;`InstanceType`&lt;`T`&gt;&gt; |

## Properties

### entityId? \{#entityid\}

```ts
entityId?:
  | EntityStaticType<T, "idType">
  | null;
```

Defined in: [rxdb-plugin-tree/src/repository/tree-repository.interface.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/repository/tree-repository.interface.ts#L10)

ID of the root entity of the query

---

### level? \{#level\}

```ts
level?: number;
```

Defined in: [rxdb-plugin-tree/src/repository/tree-repository.interface.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/repository/tree-repository.interface.ts#L41)

Query depth (the level count includes the current node itself)

- Not provided: **unlimited depth** — `findDescendants` returns the whole subtree, `findAncestors` returns the whole ancestor chain
- `0`: only the current node (with `entityId` empty, all root nodes)
- `1`: current node + direct children
- `n`: query down to level n

#### Default Value

`undefined` (unlimited depth)

#### Remarks

No clamping, no fallback: values other than non-negative integers (negative numbers, decimals, `NaN`, strings) always throw `RxDBError`. `level` is the only tree query option interpolated directly into the recursive CTE comparison, so silently rewriting it would turn an injection into a quiet wrong query. The plugin's `assertTreeLevel` and every adapter reuse the core's generic numeric validation, so bypassing the Repository and calling an adapter directly throws the same way.

When not provided, the recursion depth is capped by each SQL adapter's internal runaway-protection constant (guarding against dirty data forming `parentId` cycles) — that is an implementation detail, not query semantics: a healthy tree never hits it.

---

### where? \{#where\}

```ts
where?: WhereType;
```

Defined in: [rxdb-plugin-tree/src/repository/tree-repository.interface.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/repository/tree-repository.interface.ts#L20)

Query condition

#### Remarks

Only filters the nodes produced by recursive expansion: the starting points (the current node when `entityId` is given, all root nodes otherwise) do not pass through where and are not subject to the `level` limit. A level that fails to match truncates the expansion there, and the descendants under it (for `findAncestors`, the ancestors above it) are not returned even if they match on their own. The incremental merge of live queries uses the same semantics as the SQL re-query.
