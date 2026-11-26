# WorktreeView

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L103)

An open read-only checkout.

## Properties

### id \{#id\}

```ts
readonly id: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L105)

The checkout id, i.e. the registry row's primary key

---

### owner \{#owner\}

```ts
readonly owner: WorktreeOwner;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L109)

The ownership

---

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L116)

The read-only instance.

#### Remarks

Public write entries throw `RxDBReadOnlyError`. Entity classes are clones of the main instance's: queries must use the classes swapped in via [WorktreeView.entityOf](#entityof).

---

### target \{#target\}

```ts
readonly target: WorktreeTarget;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L107)

The HEAD given at open time

## Methods

### close() \{#close\}

```ts
close(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L132)

Closes the read-only instance, deletes the snapshot database and the registry row; repeated calls have no side effects

#### Returns

`Promise`&lt;`void`&gt;

---

### entityOf() \{#entityof\}

```ts
entityOf<T>(EntityClass): T;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L124)

The counterpart class of a main-instance entity class on the read-only instance.

#### Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter     | Type | Description                           |
| ------------- | ---- | ------------------------------------- |
| `EntityClass` | `T`  | The entity class on the main instance |

#### Returns

`T`

The clone class with the same namespace and name

#### Throws

[WorktreeUnavailableError](../classes/WorktreeUnavailableError.md) `incomplete_entities`: the snapshot has no such entity

---

### refresh() \{#refresh\}

```ts
refresh(): Promise<WorktreeView>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:130](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L130)

Rebuilds from the main database's current state, ownership unchanged.

#### Returns

`Promise`&lt;`WorktreeView`&gt;

The new view; this view closes with it

---

### release() \{#release\}

```ts
release(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L139)

Only closes this read-only instance here and returns the lock; the snapshot database and the registry row stay.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

A persistently owned checkout is later re-opened with [WorktreeManager.attach](../classes/WorktreeManager.md#attach); a session-owned one is left for `prune()` to reclaim.
