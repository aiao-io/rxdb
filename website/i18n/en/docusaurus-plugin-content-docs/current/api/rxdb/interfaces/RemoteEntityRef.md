# RemoteEntityRef

Defined in: [packages/rxdb/src/rxdb-adapter.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L92)

The entity reference in a remote receipt.

## Remarks

`entity` is the local entity name (the remote receipt gives the table name; the adapter converts it through
the metadata), so it can go straight back to the local repository to locate that row.

## Properties

### entity \{#entity\}

```ts
entity: string;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L96)

Entity name.

---

### entityId \{#entityid\}

```ts
entityId: string;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L98)

Entity primary key.

---

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L94)

Entity namespace.
