# SyncRejection

Defined in: [packages/rxdb/src/sync-state.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L69)

A rejection record carrying the moment it happened and the source changes.

## Extends

- [`SyncRejectionReport`](SyncRejectionReport.md)

## Properties

### at \{#at\}

```ts
at: Date;
```

Defined in: [packages/rxdb/src/sync-state.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L71)

The push-commit moment.

***

### changeIds \{#changeids\}

```ts
changeIds: readonly number[];
```

Defined in: [packages/rxdb/src/sync-state.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L73)

The local change ids (`RxDBChange.id`) of this entity that were marked rejected together.

***

### code \{#code\}

```ts
code: string;
```

Defined in: [packages/rxdb/src/sync-state.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L57)

Database SQLSTATE, e.g. `42501`, `RX001`, `23503`.

#### Inherited from

[`SyncRejectionReport`](SyncRejectionReport.md).[`code`](SyncRejectionReport.md#code)

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

#### Inherited from

[`SyncRejectionReport`](SyncRejectionReport.md).[`dependsOn`](SyncRejectionReport.md#dependson)

***

### entity \{#entity\}

```ts
entity: string;
```

Defined in: [packages/rxdb/src/sync-state.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L51)

Entity name.

#### Inherited from

[`SyncRejectionReport`](SyncRejectionReport.md).[`entity`](SyncRejectionReport.md#entity)

***

### entityId \{#entityid\}

```ts
entityId: string;
```

Defined in: [packages/rxdb/src/sync-state.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L53)

The rejected entity's primary key.

#### Inherited from

[`SyncRejectionReport`](SyncRejectionReport.md).[`entityId`](SyncRejectionReport.md#entityid)

***

### message \{#message\}

```ts
message: string;
```

Defined in: [packages/rxdb/src/sync-state.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L61)

The remote's raw message.

#### Inherited from

[`SyncRejectionReport`](SyncRejectionReport.md).[`message`](SyncRejectionReport.md#message)

***

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [packages/rxdb/src/sync-state.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L49)

Entity namespace.

#### Inherited from

[`SyncRejectionReport`](SyncRejectionReport.md).[`namespace`](SyncRejectionReport.md#namespace)

***

### op \{#op\}

```ts
op: "INSERT" | "UPDATE" | "DELETE";
```

Defined in: [packages/rxdb/src/sync-state.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L55)

The merged remote operation (taken from the remote receipt, not the type of a single source change).

#### Inherited from

[`SyncRejectionReport`](SyncRejectionReport.md).[`op`](SyncRejectionReport.md#op)

***

### reason \{#reason\}

```ts
reason: "denied" | "gone" | "dependency";
```

Defined in: [packages/rxdb/src/sync-state.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L59)

Classification: `denied` rejected by RLS; `gone` the row no longer exists; `dependency` the depended-on parent
entity failed.

#### Inherited from

[`SyncRejectionReport`](SyncRejectionReport.md).[`reason`](SyncRejectionReport.md#reason)
