# RelationKind

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L38)

Entity relation type enumeration
Defines the possible relation types between entities

## Enumeration Members

### MANY\_TO\_MANY \{#many_to_many\}

```ts
MANY_TO_MANY: 'm:n';
```

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L58)

Many-to-many
Multiple entities are associated with multiple instances of another entity, usually requiring a join table

---

### MANY\_TO\_ONE \{#many_to_one\}

```ts
MANY_TO_ONE: 'm:1';
```

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L53)

Many-to-one
Multiple entities are associated with a single instance of another entity

---

### ONE\_TO\_MANY \{#one_to_many\}

```ts
ONE_TO_MANY: '1:m';
```

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L48)

One-to-many
One entity is associated with multiple instances of another entity

---

### ONE\_TO\_ONE \{#one_to_one\}

```ts
ONE_TO_ONE: '1:1';
```

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L43)

One-to-one
One entity is associated with only one instance of another entity
