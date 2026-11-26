# QueryEntityPayload

Defined in: [types.ts:298](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L298)

The parameters of the entity query command.

## Properties

### entityName \{#entityname\}

```ts
entityName: string;
```

Defined in: [types.ts:299](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L299)

---

### limit? \{#limit\}

```ts
limit?: number;
```

Defined in: [types.ts:312](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L312)

---

### namespace? \{#namespace\}

```ts
namespace?: string;
```

Defined in: [types.ts:311](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L311)

The namespace the entity belongs to.

#### Remarks

Upstream uses `namespace:name` as the entity identity, and duplicate names are allowed across different namespaces (see `SchemaManager`). When omitted, if the name is unique across the database the entity is treated as that entity; when duplicate entities exist, a structured error is returned and **no arbitrary pick is made** — picking wrong would query a different database and apply the ciphertext field set of another namespace.

It is an optional field for now to stay compatible with older extensions; it will become required in a later breaking version.
