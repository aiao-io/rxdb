# PGliteClientEvents

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:219](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L219)

PGlite client event map:
each [PGliteChangeType](../enumerations/PGliteChangeType.md) maps to a [PGliteChangeEvent](PGliteChangeEvent.md), used for strongly typed inference of `addEventListener` on [PGliteClient](../classes/PGliteClient.md) (based on [EventDispatcher](../../utils/classes/EventDispatcher.md)).

## Properties

### DELETE \{#delete\}

```ts
DELETE: PGliteChangeEvent;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:222](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L222)

---

### INSERT \{#insert\}

```ts
INSERT: PGliteChangeEvent;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:220](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L220)

---

### UPDATE \{#update\}

```ts
UPDATE: PGliteChangeEvent;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:221](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L221)
