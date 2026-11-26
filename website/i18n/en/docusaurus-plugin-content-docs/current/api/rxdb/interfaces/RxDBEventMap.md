# RxDBEventMap

Defined in: [packages/rxdb/src/rxdb-events.ts:677](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L677)

RxDB complete event map interface.

## Extends

- [`RxDBEntityEventMap`](RxDBEntityEventMap.md)

## Properties

### CAPABILITY\_ENABLED \{#capability_enabled\}

```ts
CAPABILITY_ENABLED: CapabilityEnabledEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:696](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L696)

***

### CONFLICT\_DETECTED \{#conflict_detected\}

```ts
CONFLICT_DETECTED: ConflictDetectedEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:690](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L690)

***

### CONFLICT\_PENDING \{#conflict_pending\}

```ts
CONFLICT_PENDING: ConflictPendingEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:691](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L691)

***

### ENTITY\_LOCAL\_CREATE \{#entity_local_create\}

```ts
ENTITY_LOCAL_CREATE: EntityLocalCreatedEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:668](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L668)

#### Inherited from

[`RxDBEntityEventMap`](RxDBEntityEventMap.md).[`ENTITY_LOCAL_CREATE`](RxDBEntityEventMap.md#entity_local_create)

***

### ENTITY\_LOCAL\_NEW \{#entity_local_new\}

```ts
ENTITY_LOCAL_NEW: EntityLocalNewEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:667](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L667)

#### Inherited from

[`RxDBEntityEventMap`](RxDBEntityEventMap.md).[`ENTITY_LOCAL_NEW`](RxDBEntityEventMap.md#entity_local_new)

***

### ENTITY\_LOCAL\_REMOVE \{#entity_local_remove\}

```ts
ENTITY_LOCAL_REMOVE: EntityLocalRemovedEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:670](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L670)

#### Inherited from

[`RxDBEntityEventMap`](RxDBEntityEventMap.md).[`ENTITY_LOCAL_REMOVE`](RxDBEntityEventMap.md#entity_local_remove)

***

### ENTITY\_LOCAL\_UPDATE \{#entity_local_update\}

```ts
ENTITY_LOCAL_UPDATE: EntityLocalUpdatedEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:669](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L669)

#### Inherited from

[`RxDBEntityEventMap`](RxDBEntityEventMap.md).[`ENTITY_LOCAL_UPDATE`](RxDBEntityEventMap.md#entity_local_update)

***

### ENTITY\_REMOTE\_CREATE \{#entity_remote_create\}

```ts
ENTITY_REMOTE_CREATE: EntityRemoteCreatedEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:671](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L671)

#### Inherited from

[`RxDBEntityEventMap`](RxDBEntityEventMap.md).[`ENTITY_REMOTE_CREATE`](RxDBEntityEventMap.md#entity_remote_create)

***

### ENTITY\_REMOTE\_REMOVE \{#entity_remote_remove\}

```ts
ENTITY_REMOTE_REMOVE: EntityRemoteRemovedEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:673](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L673)

#### Inherited from

[`RxDBEntityEventMap`](RxDBEntityEventMap.md).[`ENTITY_REMOTE_REMOVE`](RxDBEntityEventMap.md#entity_remote_remove)

***

### ENTITY\_REMOTE\_UPDATE \{#entity_remote_update\}

```ts
ENTITY_REMOTE_UPDATE: EntityRemoteUpdatedEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:672](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L672)

#### Inherited from

[`RxDBEntityEventMap`](RxDBEntityEventMap.md).[`ENTITY_REMOTE_UPDATE`](RxDBEntityEventMap.md#entity_remote_update)

***

### MERGE\_BRANCH\_BEGIN \{#merge_branch_begin\}

```ts
MERGE_BRANCH_BEGIN: MergeBranchBeginEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:684](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L684)

***

### MERGE\_BRANCH\_COMMIT \{#merge_branch_commit\}

```ts
MERGE_BRANCH_COMMIT: MergeBranchCommitEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:685](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L685)

***

### MERGE\_BRANCH\_FAILED \{#merge_branch_failed\}

```ts
MERGE_BRANCH_FAILED: MergeBranchFailedEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:686](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L686)

***

### REMOTE\_ENTITY\_INVALIDATED \{#remote_entity_invalidated\}

```ts
REMOTE_ENTITY_INVALIDATED: RemoteEntityInvalidatedEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:695](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L695)

***

### REPOSITORY\_SYNC\_BEGIN \{#repository_sync_begin\}

```ts
REPOSITORY_SYNC_BEGIN: RepositorySyncBeginEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:692](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L692)

***

### REPOSITORY\_SYNC\_COMPLETE \{#repository_sync_complete\}

```ts
REPOSITORY_SYNC_COMPLETE: RepositorySyncCompleteEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:693](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L693)

***

### REPOSITORY\_SYNC\_ERROR \{#repository_sync_error\}

```ts
REPOSITORY_SYNC_ERROR: RepositorySyncErrorEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:694](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L694)

***

### SWITCH\_BRANCH\_BEGIN \{#switch_branch_begin\}

```ts
SWITCH_BRANCH_BEGIN: SwitchBranchBeginEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:681](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L681)

***

### SWITCH\_BRANCH\_COMMIT \{#switch_branch_commit\}

```ts
SWITCH_BRANCH_COMMIT: SwitchBranchCommitEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:682](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L682)

***

### SWITCH\_BRANCH\_ROLLBACK \{#switch_branch_rollback\}

```ts
SWITCH_BRANCH_ROLLBACK: SwitchBranchRollbackEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:683](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L683)

***

### SYNC\_BEGIN \{#sync_begin\}

```ts
SYNC_BEGIN: SyncBeginEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:687](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L687)

***

### SYNC\_COMPLETE \{#sync_complete\}

```ts
SYNC_COMPLETE: SyncCompleteEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:688](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L688)

***

### SYNC\_ERROR \{#sync_error\}

```ts
SYNC_ERROR: SyncErrorEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:689](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L689)

***

### TRANSACTION\_BEGIN \{#transaction_begin\}

```ts
TRANSACTION_BEGIN: TransactionBeginEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:678](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L678)

***

### TRANSACTION\_COMMIT \{#transaction_commit\}

```ts
TRANSACTION_COMMIT: TransactionCommitEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:679](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L679)

***

### TRANSACTION\_ROLLBACK \{#transaction_rollback\}

```ts
TRANSACTION_ROLLBACK: TransactionRollbackEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:680](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L680)
