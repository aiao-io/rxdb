# PullRepositoryOptions

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:392](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L392)

Pull repository options

## Properties

### conflictResolver? \{#conflictresolver\}

```ts
conflictResolver?: ConflictResolver;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:443](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L443)

The conflict resolver used during repository-level pull.

The current runtime only supports the automatic KEEP_LOCAL and KEEP_REMOTE resolution strategies.
MERGE and DEFER are not implemented yet and remain as to-dos.

***

### fetchAll? \{#fetchall\}

```ts
fetchAll?: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:403](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L403)

Whether to make multiple requests to pull all changes

#### Default

```ts
false
```

***

### filter? \{#filter\}

```ts
filter?: RuleGroup;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:435](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L435)

Row-level filter conditions (for SyncType.Filter)

When set, only changes corresponding to entities satisfying the conditions are pulled; the conditions apply to the entity table, not the RxDBChange table.

#### Example

```ts
// Only pulls data from the last 30 days
filter: {
  combinator: 'and',
  rules: [{ field: 'updatedAt', operator: '>=', value: thirtyDaysAgo }]
}
```

***

### includeRelated? \{#includerelated\}

```ts
includeRelated?: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:419](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L419)

Whether to include related entities (cascade sync)

When true:
- Automatically pulls all parent entities (foreign key references)
- In topological order: parent -\> child
- Example: pulling Post automatically pulls User

When false:
- Only the specified repository is synced
- If a parent entity is not synced, foreign key constraint errors may result

#### Default

```ts
true
```

***

### limit? \{#limit\}

```ts
limit?: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:397](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L397)

The maximum number of changes per pull request

#### Default

```ts
1000
```
