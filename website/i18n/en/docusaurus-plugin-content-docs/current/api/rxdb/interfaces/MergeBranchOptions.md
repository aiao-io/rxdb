# MergeBranchOptions

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:648](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L648)

Branch merge options

## Properties

### deleteSource? \{#deletesource\}

```ts
deleteSource?: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:659](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L659)

Whether to delete the source branch after the merge

#### Default

```ts
false;
```

---

### strategy? \{#strategy\}

```ts
strategy?: MergeStrategy;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:653](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L653)

Merge strategy

#### Default

```ts
'squash';
```
