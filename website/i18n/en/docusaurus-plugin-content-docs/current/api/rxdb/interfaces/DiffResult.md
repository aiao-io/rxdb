# DiffResult

Defined in: [packages/rxdb/src/repository/diff-metadata.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/diff-metadata.ts#L31)

Diff result, containing the classified entity IDs

## Properties

### freshIds \{#freshids\}

```ts
freshIds: string[];
```

Defined in: [packages/rxdb/src/repository/diff-metadata.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/diff-metadata.ts#L37)

Both exist and local is the latest — pull skipped

***

### missingIds \{#missingids\}

```ts
missingIds: string[];
```

Defined in: [packages/rxdb/src/repository/diff-metadata.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/diff-metadata.ts#L33)

Exists on the remote but not locally — needs pulling

***

### orphanIds \{#orphanids\}

```ts
orphanIds: string[];
```

Defined in: [packages/rxdb/src/repository/diff-metadata.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/diff-metadata.ts#L39)

Exists locally but not in the remote result set — possibly already deleted or outside the filter range

***

### staleIds \{#staleids\}

```ts
staleIds: string[];
```

Defined in: [packages/rxdb/src/repository/diff-metadata.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/diff-metadata.ts#L35)

Both exist but local is outdated — needs updating
