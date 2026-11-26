# PushOptions

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:198](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L198)

Options for push operations

## Properties

### batchSize? \{#batchsize\}

```ts
batchSize?: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:203](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L203)

Maximum number of items per push

#### Default

```ts
1000;
```

---

### repositoryFilter? \{#repositoryfilter\}

```ts
repositoryFilter?: (string | RepositoryIdentifier)[];
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:211](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L211)

Optional entity filter list (for repository-level sync)
Only pushes changes of the specified entities

#### Examples

```ts
['Todo', 'User'];
```

```ts
[{ namespace: 'public', entity: 'Todo' }];
```
