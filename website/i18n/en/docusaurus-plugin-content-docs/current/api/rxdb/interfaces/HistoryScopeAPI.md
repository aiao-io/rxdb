# HistoryScopeAPI

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:231](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L231)

History scope API
All scopes return the same interface, eliminating special cases

## Properties

### count$ \{#count\}

```ts
count$: Observable<number>;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:240](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L240)

Total number of history records

---

### histories$ \{#histories\}

```ts
histories$: Observable<HistoryItem[]>;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:234](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L234)

Stream of history records

---

### redoBarrier$ \{#redobarrier\}

```ts
redoBarrier$: Observable<{
  branchIds: readonly string[];
  reason: 'inherited_by_branch';
} | null>;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:260](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L260)

Why the redo stack stops where it does; same measure as [HistoryScopeAPI.undoBarrier$](#undobarrier)

---

### redoCount$ \{#redocount\}

```ts
redoCount$: Observable<number>;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:244](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L244)

Number of redoable records

---

### redoHistories$ \{#redohistories\}

```ts
redoHistories$: Observable<HistoryItem[]>;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:238](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L238)

Stream of redoable history records

---

### type \{#type\}

```ts
type: HistoryScopeType;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:232](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L232)

---

### undoBarrier$ \{#undobarrier\}

```ts
undoBarrier$: Observable<{
  branchIds: readonly string[];
  reason: 'inherited_by_branch';
} | null>;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:253](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L253)

Why the undo stack stops where it does: set when one more step back would be a change already inherited by a child branch, otherwise `null`.

#### Remarks

Changes on the current branch no later than a child branch's fork point have already been inherited by that child branch. Undoing or redoing them would make the reverse patches recorded by the child branch stale, so switching back to the current branch would read wrong values; that is why they do not appear in [HistoryScopeAPI.undoHistories$](#undohistories) and `undo()` cannot reach them. The undo stack stops at the fork point, and this explains why. Once the child branches that inherited them are deleted, the restriction is lifted.

---

### undoCount$ \{#undocount\}

```ts
undoCount$: Observable<number>;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:242](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L242)

Number of undoable records

---

### undoHistories$ \{#undohistories\}

```ts
undoHistories$: Observable<HistoryItem[]>;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:236](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L236)

Stream of undoable history records

## Methods

### redo() \{#redo\}

```ts
redo(step?): Promise<void>;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:265](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L265)

Redo operation; does nothing when redoing up to the step blocked by [HistoryScopeAPI.redoBarrier$](#redobarrier)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `step?`   | `number` |

#### Returns

`Promise`&lt;`void`&gt;

---

### undo() \{#undo\}

```ts
undo(step?): Promise<void>;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:263](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L263)

Undo operation; does nothing when undoing up to the step blocked by [HistoryScopeAPI.undoBarrier$](#undobarrier)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `step?`   | `number` |

#### Returns

`Promise`&lt;`void`&gt;
