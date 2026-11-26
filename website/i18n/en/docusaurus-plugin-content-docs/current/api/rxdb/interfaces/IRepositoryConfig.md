---
sidebar_label: 'IRepositoryConfig⟨RT⟩'
---

# IRepositoryConfig`<RT>`

Defined in: [packages/rxdb/src/rxdb.types.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.types.ts#L52)

IRepositoryConfig unified registration configuration

## Remarks

The incremental merge implementation is **not here**: it is registered per task type on
the [QueryManager.registerMergeCreateFn](QueryManager.md#registermergecreatefn) family, and each Repository registers its own at construction
(see `TreeRepository` / `GraphRepository`). Here only "which class to use, whether to generate entities dynamically,
which sync strategies cannot hold up" is declared.

## Type Parameters

| Type Parameter                                                                              | Default type                                  |
| ------------------------------------------------------------------------------------------- | --------------------------------------------- |
| <a id="type-parameter-rt"></a> `RT` _extends_ [`RepositoryInstance`](RepositoryInstance.md) | [`RepositoryInstance`](RepositoryInstance.md) |

## Properties

### class \{#class\}

```ts
class: RepositoryConstructor<RT>;
```

Defined in: [packages/rxdb/src/rxdb.types.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.types.ts#L58)

---

### entityGenerator? \{#entitygenerator\}

```ts
entityGenerator?: (metadata) =>
  | EntityType
  | EntityType[];
```

Defined in: [packages/rxdb/src/rxdb.types.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.types.ts#L56)

Dynamically generates Entity classes from [EntityMetadata](../type-aliases/EntityMetadata.md) (join table and similar scenarios)

#### Parameters

| Parameter  | Type                                                  |
| ---------- | ----------------------------------------------------- |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) |

#### Returns

\| [`EntityType`](../type-aliases/EntityType.md)
\| [`EntityType`](../type-aliases/EntityType.md)[]

---

### unsupportedSyncTypes? \{#unsupportedsynctypes\}

```ts
unsupportedSyncTypes?: Partial<Record<SyncType, string>>;
```

Defined in: [packages/rxdb/src/rxdb.types.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.types.ts#L80)

The sync strategies this repository cannot hold up; the key is the strategy and the value is the **reason it is unsupported**.

#### Remarks

Registration-time validation turns the declarations here into `unsupportedRepositorySyncType` violations, with the reason spliced into the message as-is —
so the reason must spell out "why it breaks" and "what to use instead"; it is the only explanation a developer gets to see.

"Which repository breaks under which strategy" is knowledge of the repository implementation, and core has no criterion for it, so it is declared by the registering side rather than
hard-coded in core; plugin-registered repositories and core's built-in repositories go through the same path on this rule.

#### Example

```typescript
rxdb.repository('TreeRepository', {
  class: TreeRepository, // from @aiao/rxdb-plugin-tree
  unsupportedSyncTypes: {
    [SyncType.QueryCache]:
      'Tree queries depend on the complete local ancestor chain, while the cache only covers rows hit by queried where clauses.'
  }
});
```
