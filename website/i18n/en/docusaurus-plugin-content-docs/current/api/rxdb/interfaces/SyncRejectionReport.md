# SyncRejectionReport

Defined in: [packages/rxdb/src/sync-state.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L47)

An entity rejected by the remote, for reporting at the push-commit site.

## Remarks

The granularity is the **entity**, not a single local change: the remote merges by entity and then persists or
rejects as a whole; multiple source changes of the same entity are recorded together in
[SyncRejection.changeIds](SyncRejection.md#changeids).

## Extended by

- [`SyncRejection`](SyncRejection.md)

## Properties

### code \{#code\}

```ts
code: string;
```

Defined in: [packages/rxdb/src/sync-state.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L57)

Database SQLSTATE, e.g. `42501`, `RX001`, `23503`.

***

### dependsOn? \{#dependson\}

```ts
dependsOn?: 
  | RemoteEntityRef
  | {
  constraint: string;
};
```

Defined in: [packages/rxdb/src/sync-state.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L63)

Points to the parent entity when a dependency failed; gives the constraint name when the parent entity cannot
be located.

***

### entity \{#entity\}

```ts
entity: string;
```

Defined in: [packages/rxdb/src/sync-state.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L51)

Entity name.

***

### entityId \{#entityid\}

```ts
entityId: string;
```

Defined in: [packages/rxdb/src/sync-state.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L53)

The rejected entity's primary key.

***

### message \{#message\}

```ts
message: string;
```

Defined in: [packages/rxdb/src/sync-state.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L61)

The remote's raw message.

***

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [packages/rxdb/src/sync-state.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L49)

Entity namespace.

***

### op \{#op\}

```ts
op: "INSERT" | "UPDATE" | "DELETE";
```

Defined in: [packages/rxdb/src/sync-state.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L55)

The merged remote operation (taken from the remote receipt, not the type of a single source change).

***

### reason \{#reason\}

```ts
reason: "denied" | "gone" | "dependency";
```

Defined in: [packages/rxdb/src/sync-state.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L59)

Classification: `denied` rejected by RLS; `gone` the row no longer exists; `dependency` the depended-on parent
entity failed.
