# SyncConflict

Defined in: [packages/rxdb/src/sync-state.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L35)

A conflict record with the moment it happened

## Extends

- [`SyncConflictReport`](SyncConflictReport.md)

## Properties

### at \{#at\}

```ts
at: Date;
```

Defined in: [packages/rxdb/src/sync-state.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L37)

The moment of judgment

---

### entity \{#entity\}

```ts
entity: string;
```

Defined in: [packages/rxdb/src/sync-state.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L25)

Entity name

#### Inherited from

[`SyncConflictReport`](SyncConflictReport.md).[`entity`](SyncConflictReport.md#entity)

---

### entityId \{#entityid\}

```ts
entityId: string;
```

Defined in: [packages/rxdb/src/sync-state.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L27)

The primary key of the entity involved in the judgment

#### Inherited from

[`SyncConflictReport`](SyncConflictReport.md).[`entityId`](SyncConflictReport.md#entityid)

---

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [packages/rxdb/src/sync-state.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L23)

Entity namespace

#### Inherited from

[`SyncConflictReport`](SyncConflictReport.md).[`namespace`](SyncConflictReport.md#namespace)

---

### winner \{#winner\}

```ts
winner: 'local' | 'remote';
```

Defined in: [packages/rxdb/src/sync-state.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L29)

Who won: `remote` means the local changes made while offline were discarded

#### Inherited from

[`SyncConflictReport`](SyncConflictReport.md).[`winner`](SyncConflictReport.md#winner)
