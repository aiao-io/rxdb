# PushRepositoryOptions

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:449](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L449)

Push repository options.

## Properties

### batchSize? \{#batchsize\}

```ts
batchSize?: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:454](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L454)

The maximum number of changes per push batch.

#### Default

```ts
1000
```

***

### includeRelated? \{#includerelated\}

```ts
includeRelated?: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:470](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L470)

Whether to include related entities (cascade sync).

When true:
- Automatically pushes all child entities (entities that reference the current entity)
- In reverse topological order: child -\> parent
- Example: pushing User automatically pushes Post

When false:
- Only syncs the specified repository
- May leave the remote data incomplete

#### Default

```ts
true
```
