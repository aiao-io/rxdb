# InvalidSearchableField

Defined in: [packages/rxdb-plugin-search/src/core/schema-validator.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/schema-validator.ts#L38)

Details of a schema validation failure.

## Properties

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb-plugin-search/src/core/schema-validator.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/schema-validator.ts#L40)

Entity name (e.g. `Article`)

---

### field \{#field\}

```ts
readonly field: string;
```

Defined in: [packages/rxdb-plugin-search/src/core/schema-validator.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/schema-validator.ts#L42)

Field name (the name of the property declaration, Uncapitalize)

---

### type \{#type\}

```ts
readonly type: string;
```

Defined in: [packages/rxdb-plugin-search/src/core/schema-validator.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/schema-validator.ts#L44)

Actual type string
