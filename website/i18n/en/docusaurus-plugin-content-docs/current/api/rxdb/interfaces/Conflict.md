# Conflict

Defined in: [packages/rxdb/src/sync-contract/conflict.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/conflict.ts#L8)

Conflict information.

A conflict arises when a local unsynced change and a remote change target the same entity.

## Properties

### base? \{#base\}

```ts
base?: Record<string, unknown>;
```

Defined in: [packages/rxdb/src/sync-contract/conflict.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/conflict.ts#L27)

Common-ancestor data (used for three-way merge, optional).

***

### entityKey \{#entitykey\}

```ts
entityKey: string;
```

Defined in: [packages/rxdb/src/sync-contract/conflict.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/conflict.ts#L12)

Entity key: `${namespace}:${entity}:${entityId}`.

***

### local \{#local\}

```ts
local: IRxDBChange;
```

Defined in: [packages/rxdb/src/sync-contract/conflict.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/conflict.ts#L17)

Local change.

***

### remote \{#remote\}

```ts
remote: IRxDBChange;
```

Defined in: [packages/rxdb/src/sync-contract/conflict.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/conflict.ts#L22)

Remote change.
