# PullOptions

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:155](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L155)

Options for pull operations

## Properties

### conflictResolver? \{#conflictresolver\}

```ts
conflictResolver?: ConflictResolver;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L187)

Conflict resolver

Called when a pull detects that a local unsynced change and a remote change target the same entity. If not provided, [LWWConflictResolver](../classes/LWWConflictResolver.md) is used.

#### Remarks

Passed through on both the batch path and the per-repository path; both paths give the same result for the same conflict. At runtime only `KEEP_LOCAL` and `KEEP_REMOTE` resolutions can be applied automatically; see [ConflictResolution](../type-aliases/ConflictResolution.md).

---

### fetchAll? \{#fetchall\}

```ts
fetchAll?: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:166](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L166)

Whether to handle pagination automatically and pull all data

#### Default

```ts
false;
```

---

### limit? \{#limit\}

```ts
limit?: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:160](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L160)

Maximum number of items per pull

#### Default

```ts
1000;
```

---

### repositoryFilter? \{#repositoryfilter\}

```ts
repositoryFilter?: (string | RepositoryIdentifier)[];
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L174)

Optional entity filter list (for repository-level sync)
Only pulls changes of the specified entities

#### Examples

```ts
['Todo', 'User'];
```

```ts
[{ namespace: 'public', entity: 'Todo' }];
```
