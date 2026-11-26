# PullRepositoryOptions

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:392](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L392)

Pull repository options.

## Properties

### conflictResolver? \{#conflictresolver\}

```ts
conflictResolver?: ConflictResolver;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:443](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L443)

The conflict resolver used during repository-level pulls.

At the current runtime only the automatic KEEP_LOCAL and KEEP_REMOTE strategies are supported.
MERGE and DEFER are to-do items and not yet implemented.

---

### fetchAll? \{#fetchall\}

```ts
fetchAll?: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:403](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L403)

Whether to issue multiple requests to pull all changes.

#### Default

```ts
false;
```

---

### filter? \{#filter\}

```ts
filter?: RuleGroup;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:435](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L435)

Row-level filter condition (used by SyncType.Filter).

When set, only changes corresponding to entities satisfying the condition are pulled; the condition applies to
the entity table, not the RxDBChange table.

#### Example

```ts
// Only pull data from the last 30 days
filter: {
  combinator: 'and',
  rules: [{ field: 'updatedAt', operator: '>=', value: thirtyDaysAgo }]
}
```

---

### includeRelated? \{#includerelated\}

```ts
includeRelated?: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:419](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L419)

Whether to include related entities (cascade sync).

When true:

- Automatically pulls all parent entities (foreign key references)
- In topological order: parent -\> child
- Example: pulling Post automatically pulls User

When false:

- Only syncs the specified repository
- May cause foreign key constraint errors if the parent entity is not synced

#### Default

```ts
true;
```

---

### limit? \{#limit\}

```ts
limit?: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:397](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L397)

The maximum number of changes pulled per request.

#### Default

```ts
1000;
```
