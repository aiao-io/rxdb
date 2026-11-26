# SyncConflictReport

Defined in: [packages/rxdb/src/sync-state.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L21)

The result of one conflict decision, for reporting where the conflict occurred.

## Extended by

- [`SyncConflict`](SyncConflict.md)

## Properties

### entity \{#entity\}

```ts
entity: string;
```

Defined in: [packages/rxdb/src/sync-state.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L25)

Entity name.

***

### entityId \{#entityid\}

```ts
entityId: string;
```

Defined in: [packages/rxdb/src/sync-state.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L27)

The primary key of the entity involved in the decision.

***

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [packages/rxdb/src/sync-state.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L23)

Entity namespace.

***

### winner \{#winner\}

```ts
winner: "local" | "remote";
```

Defined in: [packages/rxdb/src/sync-state.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L29)

Who won: `remote` means local changes made while offline were discarded.
