# DbInfoEntity

Defined in: [types.ts:204](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L204)

The summary of a single entity in `DB_INFO`.

## Properties

### encryptedFields \{#encryptedfields\}

```ts
encryptedFields: string[];
```

Defined in: [types.ts:210](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L210)

The top-level field names of this entity marked as encrypted by metadata; these fields are already masked in query results.

---

### name \{#name\}

```ts
name: string;
```

Defined in: [types.ts:206](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L206)

The entity name (without the namespace).

---

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [types.ts:208](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L208)

The namespace the entity belongs to; `'public'` when not declared.
