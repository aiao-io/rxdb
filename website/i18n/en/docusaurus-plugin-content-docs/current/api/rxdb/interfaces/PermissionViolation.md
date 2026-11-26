# PermissionViolation

Defined in: [packages/rxdb/src/entity/entity-permissions.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-permissions.ts#L77)

One permission violation: which write operation of which entity was rejected by a public write entrance

## Properties

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb/src/entity/entity-permissions.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-permissions.ts#L81)

The entity name (the `name` in the metadata)

***

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb/src/entity/entity-permissions.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-permissions.ts#L79)

The entity's namespace

***

### operation \{#operation\}

```ts
readonly operation: EntityOperation;
```

Defined in: [packages/rxdb/src/entity/entity-permissions.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-permissions.ts#L83)

The rejected write operation
