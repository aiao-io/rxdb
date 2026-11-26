# RxDBChange

Defined in: [packages/rxdb/src/system/change.ts:140](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L140)

Database change record

Used to record the change history of all entities in the database
Mainly used for data change tracking, audit logs and possible data rollback operations

## Implements

- [`IRxDBChange`](../interfaces/IRxDBChange.md)

## Constructors

### Constructor

```ts
new RxDBChange(): RxDBChange;
```

#### Returns

`RxDBChange`

## Properties

### branch$ \{#branch\}

```ts
branch$: RelationEntityObservable<typeof RxDBBranch>;
```

Defined in: [packages/rxdb/src/system/change.ts:720](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L720)

The branch it belongs to

***

### branchId? \{#branchid\}

```ts
branchId?: string;
```

Defined in: [packages/rxdb/src/system/change.ts:189](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L189)

Branch id

#### Implementation of

[`IRxDBChange`](../interfaces/IRxDBChange.md).[`branchId`](../interfaces/IRxDBChange.md#branchid)

***

### createdAt \{#createdat\}

```ts
createdAt: Date;
```

Defined in: [packages/rxdb/src/system/change.ts:330](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L330)

Creation time

#### Default

```ts
new Date()
```

#### Implementation of

[`IRxDBChange`](../interfaces/IRxDBChange.md).[`createdAt`](../interfaces/IRxDBChange.md#createdat)

***

### entity \{#entity\}

```ts
entity: string;
```

Defined in: [packages/rxdb/src/system/change.ts:179](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L179)

Entity name

#### Implementation of

[`IRxDBChange`](../interfaces/IRxDBChange.md).[`entity`](../interfaces/IRxDBChange.md#entity)

***

### entityId \{#entityid\}

```ts
entityId: RxDBEntityId;
```

Defined in: [packages/rxdb/src/system/change.ts:184](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L184)

Entity ID

#### Implementation of

[`IRxDBChange`](../interfaces/IRxDBChange.md).[`entityId`](../interfaces/IRxDBChange.md#entityid)

***

### id \{#id\}

```ts
id: number;
```

Defined in: [packages/rxdb/src/system/change.ts:146](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L146)

id

#### Implementation of

[`IRxDBChange`](../interfaces/IRxDBChange.md).[`id`](../interfaces/IRxDBChange.md#id)

***

### inversePatch? \{#inversepatch\}

```ts
inversePatch?: Record<string, unknown> | null;
```

Defined in: [packages/rxdb/src/system/change.ts:266](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L266)

Reverse patch - old value record used for rollback operations

Records the data state before the operation, used for **undo** operations

#### Example

```ts
// Scenario 1: create user (INSERT)
{
  type: 'INSERT',
  entityId: '123',  // ID is recorded in entityId
  patch: { name: 'Alice', age: 25 }, // the complete new data (excluding id)
  inversePatch: null                  // no data before creation, so null
}
// Undo INSERT: use inversePatch = null to indicate a DELETE operation is needed

// Scenario 2: update user (UPDATE)
// Change the username from "Alice" to "Bob", age from 25 to 26
{
  type: 'UPDATE',
  entityId: '123',
  patch: { name: 'Bob', age: 26 },        // new value after the change (only changed fields, excluding id)
  inversePatch: { name: 'Alice', age: 25 } // old value before the change (only changed fields, excluding id)
}
// Undo UPDATE: use inversePatch to restore the old values

// Scenario 3: delete user (DELETE)
{
  type: 'DELETE',
  entityId: '123',
  patch: null,                                    // no data after deletion, so null
  inversePatch: { name: 'Alice', age: 25, ... }  // complete data before deletion (excluding id)
}
// Undo DELETE: use inversePatch to restore the complete record (id is taken from entityId)
```

#### Remarks

**inversePatch rules for the three operation types:**
- **INSERT**: `inversePatch = null` (no old data before creation)
- **UPDATE**: `inversePatch = { old values of the changed fields }` (only changed fields are recorded, incremental data, **excluding id**)
- **DELETE**: `inversePatch = { the complete deleted data }` (all fields except id, **excluding id**)

**Important notes:**
- ⚠️ `inversePatch` and `patch` **do not contain the id field**; the id is already recorded in `entityId`
- When restoring data, use `entityId` as the record's id

**Undo operation logic:**
- Undo INSERT → execute DELETE (using entityId)
- Undo UPDATE → execute UPDATE (using entityId + inversePatch)
- Undo DELETE → execute INSERT (using entityId + inversePatch)

#### Implementation of

[`IRxDBChange`](../interfaces/IRxDBChange.md).[`inversePatch`](../interfaces/IRxDBChange.md#inversepatch)

***

### localId? \{#localid\}

```ts
localId?: number | null;
```

Defined in: [packages/rxdb/src/system/change.ts:208](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L208)

Local change ID (only used by the remote rxdb_change table)

When a local change is pushed to the remote, the local changeId is recorded.
During pull, changes pushed by this client are recognized via clientId (not via localId,
because remote records have no localId when the push goes through the actions-only compaction path);
when localId exists, it is used to backfill the remoteId of the local change.

#### Implementation of

[`IRxDBChange`](../interfaces/IRxDBChange.md).[`localId`](../interfaces/IRxDBChange.md#localid)

***

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [packages/rxdb/src/system/change.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L174)

Namespace

#### Implementation of

[`IRxDBChange`](../interfaces/IRxDBChange.md).[`namespace`](../interfaces/IRxDBChange.md#namespace)

***

### patch? \{#patch\}

```ts
patch?: Record<string, unknown> | null;
```

Defined in: [packages/rxdb/src/system/change.ts:324](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L324)

Forward patch - new value record used for replaying operations

Records the data state after the operation, used for **redo** operations

#### Example

```ts
// Scenario 1: create user (INSERT)
{
  type: 'INSERT',
  entityId: '123',  // ID is recorded in entityId
  patch: { name: 'Alice', age: 25 }, // the complete new data (excluding id)
  inversePatch: null
}
// Redo INSERT: execute an INSERT with the complete data from entityId + patch

// Scenario 2: update user (UPDATE)
// Change the username from "Alice" to "Bob", age from 25 to 26
{
  type: 'UPDATE',
  entityId: '123',
  patch: { name: 'Bob', age: 26 },        // new value after the change (only changed fields, excluding id)
  inversePatch: `{ name: 'Alice', age: 25 }`
}
// Redo UPDATE: execute an UPDATE with the incremental data from entityId + patch

// Scenario 3: delete user (DELETE)
{
  type: 'DELETE',
  entityId: '123',
  patch: null,                                    // no data after deletion, so null
  inversePatch: `{ name: 'Alice', age: 25, ... }`
}
// Redo DELETE: execute a DELETE using entityId (patch is null)
```

#### Remarks

**patch rules for the three operation types:**
- **INSERT**: `patch = { the complete new data }` (all fields except id, **excluding id**)
- **UPDATE**: `patch = { new values of the changed fields }` (only changed fields are recorded, incremental data, **excluding id**)
- **DELETE**: `patch = null` (no data after deletion)

**Important notes:**
- ⚠️ `patch` and `inversePatch` **do not contain the id field**; the id is already recorded in `entityId`
- When executing operations, use `entityId` as the record's id

**Redo operation logic:**
- Redo INSERT → execute INSERT (using entityId + patch's complete data)
- Redo UPDATE → execute UPDATE (using entityId + patch's incremental data)
- Redo DELETE → execute DELETE (using entityId)

**Symmetry with inversePatch:**
- INSERT: `patch = complete data (excluding id), inversePatch = null`
- UPDATE: `patch = new value increments (excluding id), inversePatch = old value increments (excluding id)`
- DELETE: `patch = null, inversePatch = complete data (excluding id)`

#### Implementation of

[`IRxDBChange`](../interfaces/IRxDBChange.md).[`patch`](../interfaces/IRxDBChange.md#patch)

***

### redoInvalidatedAt? \{#redoinvalidatedat\}

```ts
redoInvalidatedAt?: Date | null;
```

Defined in: [packages/rxdb/src/system/change.ts:715](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L715)

Redo invalidation timestamp

When the user creates a new operation after performing an undo, all redoable changes are marked as "invalidated"
Invalidated changes no longer appear in the redo stack, but remain in the database for auditing

#### Remarks

**Core mechanism:**
- User operations: create A → create B → undo(B) → create C
- At this point B's `redoInvalidatedAt` is set to C's creation time
- B can no longer be redone, matching standard undo/redo stack behavior

**State determination rules:**
```
revertChangeId  | redoInvalidatedAt | State description
----------------|-------------------|---------------------------
null            | null              | in effect normally
123             | null              | undone, redoable
123             | 2025-01-11T10:00  | undone and invalidated, not redoable
null            | 2025-01-11T10:00  | (this state should not occur)
```

**Relationship with revertChangeId/revertChangedAt:**
- `revertChangeId != null` → already undone
- `redoInvalidatedAt != null` → the redo opportunity has lapsed
- The two are independent: undo is an explicit user action, invalidation is a side effect triggered by new operations

#### Examples

```ts
// Scenario 1: standard undo/redo stack behavior
// Step 1: the user creates 3 records
const changes = [
  { id: 1, type: 'INSERT', entity: 'A', revertChangeId: null, redoInvalidatedAt: null },
  { id: 2, type: 'INSERT', entity: 'B', revertChangeId: null, redoInvalidatedAt: null },
  `{ id: 3, type: 'INSERT', entity: 'C', revertChangeId: null, redoInvalidatedAt: null }`
];

// Step 2: the user undoes C
await undoDatabase(1);
// Result:
{ id: 3, revertChangeId: 4, revertChangedAt: '2025-01-11T10:00:00', redoInvalidatedAt: null }
// The redo stack now contains C

// Step 3: the user creates new data D
const newChange = { id: 5, type: 'INSERT', entity: 'D' };
await newChange.save();

// Step 4: the system automatically marks C as invalidated
{
  id: 3,
  revertChangeId: 4,
  revertChangedAt: '2025-01-11T10:00:00',
  redoInvalidatedAt: '2025-01-11T10:05:00'  // ✅ creation time of the new data
}
// The redo stack is now empty; C cannot be redone
```

```ts
// Scenario 2: create new data after multiple undos
// Step 1: initial state
[
  { id: 1, entity: 'A', revertChangeId: null },
  { id: 2, entity: 'B', revertChangeId: null },
  { id: 3, entity: 'C', revertChangeId: null },
  `{ id: 4, entity: 'D', revertChangeId: null }`
];

// Step 2: the user undoes 2 times in a row (D and C)
await undoDatabase(2);
// Result:
{ id: 4, revertChangeId: 5, revertChangedAt: '10:00:00', redoInvalidatedAt: null }
{ id: 3, revertChangeId: 6, revertChangedAt: '10:00:01', redoInvalidatedAt: null }
// redo stack: [D, C] (in reverse order of undo time)

// Step 3: the user creates new data E
const e = { id: 7, type: 'INSERT', entity: 'E' };
await e.save();

// Step 4: the system invalidates all redoable changes in a batch
{
  id: 4,
  revertChangeId: 5,
  redoInvalidatedAt: '2025-01-11T10:10:00'  // ✅ E's creation time
}
{
  id: 3,
  revertChangeId: 6,
  redoInvalidatedAt: '2025-01-11T10:10:00'  // ✅ E's creation time
}
// The redo stack is cleared; D and C cannot be redone
```

```ts
// Scenario 3: the complete undo/redo/new-operation flow
// Steps 1-3: (same as scenario 1)
// Step 4: the user realizes they do not want D, so they undo D first
await undoDatabase(1);
{ id: 5, revertChangeId: 8, revertChangedAt: '10:06:00', redoInvalidatedAt: null }

// Step 5: the user tries to redo C (fails, because it is already invalidated)
await redoDatabase(1);
// redoHistories$ filters out C (redoInvalidatedAt != null)
// only D can be redone

// Current state:
{ id: 3, revertChangeId: 4, redoInvalidatedAt: '10:05:00' }  // C is invalidated
{ id: 5, revertChangeId: 8, redoInvalidatedAt: null }       // D is redoable
```

```ts
// Scenario 4: query examples
// Query all redoable changes (not invalidated):
RxDBChange.findAll({
  where: {
    combinator: 'and',
    rules: [
      { field: 'revertChangeId', operator: '!=', value: null },
      `{ field: 'redoInvalidatedAt', operator: '=', value: null }`
    ]
  }
});

// Query all invalidated redo opportunities (for auditing):
RxDBChange.findAll({
  where: {
    combinator: 'and',
    rules: [
      `{ field: 'redoInvalidatedAt', operator: '!=', value: null }`
    ]
  }
});
```

#### See

 - [revertChangeId](#revertchangeid) - the undo marker, used together to determine whether redo is possible
 - [revertChangedAt](#revertchangedat) - the undo timestamp

***

### rejectedAt? \{#rejectedat\}

```ts
rejectedAt?: Date | null;
```

Defined in: [packages/rxdb/src/system/change.ts:162](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L162)

The time the remote rejected this local change

#### Remarks

Written together with the receipt inside the push commit transaction: set to the current time when the remote receipt has `status: 'rejected'`, otherwise stays `null`.
Mutually exclusive with [RxDBChange.remoteId](#remoteid) — at most one of them is non-null per row; a rejected change never gets a remote ID.
This column only exists in system schema 7; old rows from 6 and earlier are `null` after migration and are not backfilled.

***

### rejection? \{#rejection\}

```ts
rejection?: 
  | RemoteChangeRejection
  | null;
```

Defined in: [packages/rxdb/src/system/change.ts:170](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L170)

The reason the remote rejected this local change, with the same shape as the rejection details in the remote receipt

#### Remarks

Written at the same time as [RxDBChange.rejectedAt](#rejectedat), and null at the same time.

***

### remoteId? \{#remoteid\}

```ts
remoteId?: number | null;
```

Defined in: [packages/rxdb/src/system/change.ts:152](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L152)

Remote change ID
Indicates that this change was synced from the remote

***

### revertChangedAt? \{#revertchangedat\}

```ts
revertChangedAt?: Date | null;
```

Defined in: [packages/rxdb/src/system/change.ts:424](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L424)

Undo timestamp

Records the time this change was undone, used for auditing and tracking the complete lifecycle of the change

#### Remarks

**State marker rules:**
- `revertChangedAt = null`: the change has never been undone, in normal effect
- `revertChangedAt != null` and `revertChangeId != null`: the change has been undone, currently not in effect
- `revertChangedAt != null` and `revertChangeId = null`: the change was undone and then restored (redo)

**Special handling of redo:**
- When performing a redo, only `revertChangeId` is cleared (set to null)
- The `revertChangedAt` timestamp is **kept** to record the history of having been undone
- This way the complete operation history can be tracked: create → undo (time recorded) → restore (time kept)

#### Examples

```ts
// Scenario 1: normal change (never undone)
{
  id: 1,
  type: 'INSERT',
  revertChangeId: null,
  revertChangedAt: null  // never undone
}
```

```ts
// Scenario 2: an undone change
{
  id: 3,
  type: 'DELETE',
  revertChangeId: 4,
  revertChangedAt: new Date('2025-01-11T10:00:00Z')  // undone at this time
}
// Query condition: WHERE revertChangeId IS NOT NULL gets all undone changes
```

```ts
// Scenario 3: a change undone then restored (complete lifecycle)
// Initial creation:
{ id: 5, type: 'UPDATE', createdAt: '2025-01-11T09:00:00Z', revertChangedAt: null }

// The user performs undo:
{
  id: 5,
  revertChangeId: 6,
  revertChangedAt: new Date('2025-01-11T10:00:00Z')  // the undo time is recorded
}

// The user performs redo (restore):
{
  id: 5,
  revertChangeId: null,  // ✅ cleared, indicating it is back in effect
  revertChangedAt: new Date('2025-01-11T10:00:00Z')  // ⚠️ kept, as an audit trail
}

// From this record we can tell:
// - created at 09:00:00
// - undone at 10:00:00
// - restored (at some later time)
// - revertChangedAt permanently keeps the undo time for audit analysis
```

```ts
// Scenario 4: audit query examples
// Query all currently undone changes:
// SELECT * FROM RxDBChange WHERE revertChangeId IS NOT NULL

// Query all changes that have ever been undone (including restored ones):
// SELECT * FROM RxDBChange WHERE revertChangedAt IS NOT NULL

// Query changes that were undone but have been restored:
// SELECT * FROM RxDBChange
// WHERE revertChangedAt IS NOT NULL AND revertChangeId IS NULL

// Query changes undone within a specific time range:
// SELECT * FROM RxDBChange
// WHERE revertChangedAt BETWEEN '2025-01-11T09:00:00Z' AND '2025-01-11T11:00:00Z'
```

#### See

[revertChangeId](#revertchangeid) - the undo marker ID, used together with this timestamp to determine the undo state

***

### revertChangeId? \{#revertchangeid\}

```ts
revertChangeId?: number | null;
```

Defined in: [packages/rxdb/src/system/change.ts:574](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L574)

The ID that undid this change

Used to mark that this change has been undone and to reserve a sequence number slot to keep the change history continuous and traceable

#### Remarks

**Core mechanism:**
- When performing an undo, **no new change record is created**
- Instead, `revertChangeId` and `revertChangedAt` are marked on the undone change
- `revertChangeId` points to the **next ID that should be allocated** (equal to the current sequence value + 1)
- The system **increments the sequence value** to reserve the slot for revertChangeId (but does not actually create a record)
- This leaves an "undo trace" in the change history for auditing and timeline reconstruction

**ID allocation rules:**
- Normal changes: use the next sequence value (e.g. 1, 2, 3...)
- Undone changes: mark revertChangeId on the original record; the sequence skips one number (a reserved slot)
- Subsequent new changes: continue from the sequence value after the skip (e.g. 5, 6, 7...)

#### Examples

```ts
// Scenario 1: basic undo flow
// Initial state: the database has 3 change records
[
  { id: 1, type: 'INSERT', entity: 'User', revertChangeId: null },
  { id: 2, type: 'UPDATE', entity: 'User', revertChangeId: null },
  `{ id: 3, type: 'DELETE', entity: 'User', revertChangeId: null }`
]
// Current sequence value: 3

// The user performs undo, undoing record 3
// 1. Query the current sequence value: 3
// 2. Compute revertChangeId = 3 + 1 = 4
// 3. Update record 3
{ id: 3, revertChangeId: 4, revertChangedAt: new Date('2025-01-11T10:00:00Z') }
// 4. Increment the sequence value to 4 (reserve ID 4, but do not create an actual record)

// The user adds a new change (e.g. inserting a new user)
// 5. The new record uses sequence value 5 (4 was skipped)
{ id: 5, type: 'INSERT', entity: 'User', revertChangeId: null }

// Final database records:
[
  { id: 1, ... },
  { id: 2, ... },
  { id: 3, ..., revertChangeId: 4, revertChangedAt: '2025-01-11T10:00:00Z' }, // undone
  // ID 4 is vacant (reserved as the undo marker)
  { id: 5, ... }  // new change
]
```

```ts
// Scenario 2: undoing multiple changes in a row
// Initial state: 5 change records
[
  { id: 1, ... },
  { id: 2, ... },
  { id: 3, ... },
  { id: 4, ... },
  `{ id: 5, ... }`
]

// The user undoes consecutively: undo records 5, 4, 3
// Step 1: undo record 5
{ id: 5, revertChangeId: 6, revertChangedAt: '2025-01-11T10:00:00Z' }
// Sequence value: 6

// Step 2: undo record 4
{ id: 4, revertChangeId: 7, revertChangedAt: '2025-01-11T10:01:00Z' }
// Sequence value: 7

// Step 3: undo record 3
{ id: 3, revertChangeId: 8, revertChangedAt: '2025-01-11T10:02:00Z' }
// Sequence value: 8

// The user adds a new change
{ id: 9, type: 'INSERT', ... }

// Final records:
[
  { id: 1, ... },
  { id: 2, ... },
  { id: 3, ..., revertChangeId: 8 },  // undone
  { id: 4, ..., revertChangeId: 7 },  // undone
  { id: 5, ..., revertChangeId: 6 },  // undone
  // IDs 6, 7, 8 are vacant (reserved slots)
  { id: 9, ... }  // new change
]
```

```ts
// Scenario 3: undo then redo
// Initial state: record 3 has been undone
[
  { id: 1, type: 'INSERT', revertChangeId: null, revertChangedAt: null },
  { id: 2, type: 'UPDATE', revertChangeId: null, revertChangedAt: null },
  `{ id: 3, type: 'DELETE', revertChangeId: 4, revertChangedAt: '2025-01-11T10:00:00Z' }`
]
// Sequence value: 4

// The user performs redo, restoring the operation of record 3
// 1. Re-execute the operation according to patch (here: DELETE)
// 2. Update the undo state of record 3:
{
  id: 3,
  type: 'DELETE',
  revertChangeId: null,                    // ✅ cleared, indicating it is restored
  revertChangedAt: '2025-01-11T10:00:00Z'  // ⚠️ kept, recording the history of having been undone
}

// Final state:
[
  { id: 1, revertChangeId: null, revertChangedAt: null },
  { id: 2, revertChangeId: null, revertChangedAt: null },
  { id: 3, revertChangeId: null, revertChangedAt: '2025-01-11T10:00:00Z' }  // restored, but history kept
  // ID 4 is still vacant (the previously reserved undo marker slot)
]

// **Key points:**
// - revertChangeId = null: the current change is in "effect" state
// - revertChangedAt non-null: this change has been undone before (audit trail)
// - revertChangedAt lets you track the complete lifecycle of a change: create → undo → restore
```

```ts
// Scenario 4: batch undo within a transaction
// One transaction created 3 changes:
const txId = 'a1b2c3d4-...';
[
  { id: 10, type: 'INSERT', transactionId: txId, ... },
  { id: 11, type: 'UPDATE', transactionId: txId, ... },
  `{ id: 12, type: 'INSERT', transactionId: txId, ... }`
]

// The user undoes the whole transaction
// Undo in reverse order (12 → 11 → 10):
{ id: 12, revertChangeId: 13, revertChangedAt: '...' }
{ id: 11, revertChangeId: 14, revertChangedAt: '...' }
{ id: 10, revertChangeId: 15, revertChangedAt: '...' }

// The next change ID will be 16 (13, 14, 15 were skipped)
```

#### See

 - [revertChangedAt](#revertchangedat) - the timestamp of the undo operation
 - [transactionId](#transactionid) - the transaction ID, used for batch undo

***

### tableSetSuffix? \{#tablesetsuffix\}

```ts
tableSetSuffix?: string | null;
```

Defined in: [packages/rxdb/src/system/change.ts:192](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L192)

The physical table set suffix at write time; `null` for the main table set and old logs, not involved in remote sync.

***

### transactionId? \{#transactionid\}

```ts
transactionId?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: [packages/rxdb/src/system/change.ts:198](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L198)

Transaction ID, used to relate multiple changes within the same transaction
If an undo/redo operation involves multiple change records, they can be related via the same transactionId

#### Implementation of

[`IRxDBChange`](../interfaces/IRxDBChange.md).[`transactionId`](../interfaces/IRxDBChange.md#transactionid)

***

### type \{#type\}

```ts
type: "INSERT" | "UPDATE" | "DELETE";
```

Defined in: [packages/rxdb/src/system/change.ts:213](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L213)

Change type

#### Implementation of

[`IRxDBChange`](../interfaces/IRxDBChange.md).[`type`](../interfaces/IRxDBChange.md#type)

***

### updatedAt \{#updatedat\}

```ts
updatedAt: Date;
```

Defined in: [packages/rxdb/src/system/change.ts:336](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L336)

Update time

#### Default

```ts
new Date()
```

#### Implementation of

[`IRxDBChange`](../interfaces/IRxDBChange.md).[`updatedAt`](../interfaces/IRxDBChange.md#updatedat)

***

### \[ENTITY\_STATIC\_TYPES\] \{#entity_static_types\}

```ts
static [ENTITY_STATIC_TYPES]: RxDBChangeStaticTypes;
```

Defined in: [packages/rxdb/src/system/change.ts:141](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L141)

***

### count \{#count\}

```ts
static count: (options) => Observable<number>;
```

Defined in: [packages/rxdb/src/system/change.ts:744](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L744)

count query

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`CountOptions`](../interfaces/CountOptions.md)&lt;*typeof* `RxDBChange`, [`RxDBChangeRuleGroup`](../type-aliases/RxDBChangeRuleGroup.md)&gt; | Query options |

#### Returns

`Observable`&lt;`number`&gt;

#### Example

```ts
// Count all change records
RxDBChange.count({
  where: {
    combinator: 'and',
    rules: []
  }
}).subscribe();

// Count changes of a specific entity
RxDBChange.count({
  where: {
    combinator: 'and',
    rules: [{ field: 'entity', operator: '=', value: 'User' }]
  }
}).subscribe();
```

***

### find \{#find\}

```ts
static find: (options) => Observable<RxDBChange[]>;
```

Defined in: [packages/rxdb/src/system/change.ts:761](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L761)

find query

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`FindOptions`](../interfaces/FindOptions.md)&lt;*typeof* `RxDBChange`, [`RxDBChangeRuleGroup`](../type-aliases/RxDBChangeRuleGroup.md), [`RxDBChangeOrderByField`](../type-aliases/RxDBChangeOrderByField.md)&gt; | Query options |

#### Returns

`Observable`&lt;`RxDBChange`[]&gt;

#### Example

```ts
// Query all change records
RxDBChange.find({
  where: {
    combinator: 'and',
    rules: []
  }
}).subscribe();
```

***

### findAll \{#findall\}

```ts
static findAll: (options) => Observable<RxDBChange[]>;
```

Defined in: [packages/rxdb/src/system/change.ts:780](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L780)

findAll query

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`FindAllOptions`](../interfaces/FindAllOptions.md)&lt;*typeof* `RxDBChange`, [`RxDBChangeRuleGroup`](../type-aliases/RxDBChangeRuleGroup.md), [`RxDBChangeOrderByField`](../type-aliases/RxDBChangeOrderByField.md)&gt; | Query options |

#### Returns

`Observable`&lt;`RxDBChange`[]&gt;

#### Example

```ts
// Query all change records (ordered by ID)
RxDBChange.findAll({
  where: {
    combinator: 'and',
    rules: []
  },
  orderBy: `{ id: 'ASC' }`
}).subscribe();
```

***

### findByCursor \{#findbycursor\}

```ts
static findByCursor: (options) => Observable<RxDBChange[]>;
```

Defined in: [packages/rxdb/src/system/change.ts:787](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L787)

findByCursor query

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`FindByCursorOptions`](../interfaces/FindByCursorOptions.md)&lt;*typeof* `RxDBChange`, [`RxDBChangeRuleGroup`](../type-aliases/RxDBChangeRuleGroup.md), [`RxDBChangeOrderByField`](../type-aliases/RxDBChangeOrderByField.md)&gt; | Query options |

#### Returns

`Observable`&lt;`RxDBChange`[]&gt;

***

### findOne \{#findone\}

```ts
static findOne: (options) => Observable<RxDBChange | null>;
```

Defined in: [packages/rxdb/src/system/change.ts:805](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L805)

findOne query

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`FindOneOptions`](../interfaces/FindOneOptions.md)&lt;*typeof* `RxDBChange`, [`RxDBChangeRuleGroup`](../type-aliases/RxDBChangeRuleGroup.md), [`RxDBChangeOrderByField`](../type-aliases/RxDBChangeOrderByField.md)&gt; | Query options |

#### Returns

`Observable`&lt;`RxDBChange` \| `null`&gt;

#### Example

```ts
// Query the latest change record
RxDBChange.findOne({
  where: {
    combinator: 'and',
    rules: []
  },
  orderBy: `{ id: 'DESC' }`
}).subscribe();
```

***

### findOneOrFail \{#findoneorfail\}

```ts
static findOneOrFail: (options) => Observable<RxDBChange>;
```

Defined in: [packages/rxdb/src/system/change.ts:822](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L822)

findOneOrFail query

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`FindOneOrFailOptions`](../interfaces/FindOneOrFailOptions.md)&lt;*typeof* `RxDBChange`, [`RxDBChangeRuleGroup`](../type-aliases/RxDBChangeRuleGroup.md), [`RxDBChangeOrderByField`](../type-aliases/RxDBChangeOrderByField.md)&gt; | Query options |

#### Returns

`Observable`&lt;`RxDBChange`&gt;

#### Example

```ts
// Query the change with the given ID (throws if it does not exist)
RxDBChange.findOneOrFail({
  where: {
    combinator: 'and',
    rules: [{ field: 'id', operator: '=', value: 123 }]
  }
}).subscribe();
```

***

### get \{#get\}

```ts
static get: (options) => Observable<RxDBChange>;
```

Defined in: [packages/rxdb/src/system/change.ts:834](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change.ts#L834)

get query

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | `number` | Query options |

#### Returns

`Observable`&lt;`RxDBChange`&gt;

#### Example

```ts
// Get the change record by primary key ID
RxDBChange.get(123).subscribe();
```
