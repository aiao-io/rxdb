---
sidebar_label: 'RxDBMutationsMap⟨T⟩'
---

# RxDBMutationsMap`<T>`

Defined in: [packages/rxdb/src/rxdb-adapter.ts:147](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L147)

All changes to be persisted in one transaction, grouped by "create / delete / update"

## Remarks

Uses `Set` instead of arrays: the same entity instance can be collected by multiple paths in one flush (cascades, reverse relation maintenance). Deduplication relies on identity rather than caller discipline, otherwise the same row would be written twice.

The execution order of the three groups is decided by the adapter, not expressed by this structure — foreign key constraints require creates before their references and deletes after the referenced rows, and that is the responsibility of the adapter's `mutations()` implementation.

## Type Parameters

| Type Parameter                                                                            | Default type                                  |
| ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) | [`EntityType`](../type-aliases/EntityType.md) |

## Properties

### create \{#create\}

```ts
create: Map<T, Set<InstanceType<T>>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L148)

---

### remove \{#remove\}

```ts
remove: Map<T, Set<InstanceType<T>>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:149](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L149)

---

### update \{#update\}

```ts
update: Map<T, Set<InstanceType<T>>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:150](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L150)
