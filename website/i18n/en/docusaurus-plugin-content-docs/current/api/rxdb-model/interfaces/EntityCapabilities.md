# EntityCapabilities

Defined in: [packages/rxdb-model/src/entity-capabilities.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-capabilities.ts#L13)

UI operations allowed for the entity on public write entry points

## Properties

### canCreate \{#cancreate\}

```ts
readonly canCreate: boolean;
```

Defined in: [packages/rxdb-model/src/entity-capabilities.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-capabilities.ts#L15)

Can create: `create` is `'both'`

***

### canDelete \{#candelete\}

```ts
readonly canDelete: boolean;
```

Defined in: [packages/rxdb-model/src/entity-capabilities.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-capabilities.ts#L19)

Existing rows can be deleted: `delete` is `'both'`

***

### canEdit \{#canedit\}

```ts
readonly canEdit: boolean;
```

Defined in: [packages/rxdb-model/src/entity-capabilities.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-capabilities.ts#L17)

Existing rows can be edited: `update` is `'both'`; otherwise rows are read-only and the detail opens in view mode
