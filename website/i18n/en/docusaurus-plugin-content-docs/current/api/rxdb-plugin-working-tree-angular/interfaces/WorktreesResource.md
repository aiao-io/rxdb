# WorktreesResource

Defined in: [use-worktrees.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L36)

Checkout entry point returned by [useWorktrees](../functions/useWorktrees.md) (read-only checkouts US-313, writable checkouts US-314).

## Remarks

The ten state cells correspond one-to-one with the core `WorktreeAsyncStates`, each wrapped in a `Signal`; the method signatures match the same-named methods on the plugin package's `WorktreeManager`. Same names, same fields and same signatures across the three frameworks: React `useWorktrees()` (render snapshot), Vue `useWorktrees()` (`ComputedRef`). The entry point binds the database injected at creation time: the database in an injector never changes, so switching databases means rebuilding the component (the React version resets itself when the Provider switches databases).

`mounted` is the table set this instance currently has mounted (`rxdb.worktreeTableSet$`; it changes only after a remount finishes and the entity caches are cleared): `mounted().isMain` means the main checkout is mounted, and the registry row of a writable checkout whose `tableSetSuffix === mounted().suffix` is the mounted one; the current branch is the entry whose `activeKey === mounted().holderKey`. After a remount, the cells of `useWorkingTree()` do not re-read by themselves; components that need to follow should subscribe to `mounted` and re-read.

For the view obtained by opening, hand `view.rxdb` to the subtree via a component-level `{ provide: RxDB, useValue: view.rxdb }` and existing queries keep working; queries must use the classes swapped in via `view.entityOf()`.

## Properties

### add \{#add\}

```ts
readonly add: (branchId, options?) => Promise<Worktree>;
```

Defined in: [use-worktrees.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L68)

Creates a writable checkout (created but not mounted; this context claims it); then automatically re-reads the registry.

#### Parameters

| Parameter  | Type                                                                                    |
| ---------- | --------------------------------------------------------------------------------------- |
| `branchId` | `string`                                                                                |
| `options?` | [`WorktreeAddOptions`](../../rxdb-plugin-working-tree/interfaces/WorktreeAddOptions.md) |

#### Returns

`Promise`&lt;[`Worktree`](../../rxdb-plugin-working-tree/classes/Worktree.md)&gt;

---

### addState \{#addstate\}

```ts
readonly addState: Signal<WorkingTreeCommandState<Worktree>>;
```

Defined in: [use-worktrees.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L46)

Phase of the last `add()`: the registry row of the created writable checkout.

---

### attach \{#attach\}

```ts
readonly attach: (id) => Promise<WorktreeView>;
```

Defined in: [use-worktrees.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L64)

Opens another persistently-owned checkout; then automatically re-reads the registry.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

#### Returns

`Promise`&lt;[`WorktreeView`](../../rxdb-plugin-working-tree/interfaces/WorktreeView.md)&gt;

---

### attachState \{#attachstate\}

```ts
readonly attachState: Signal<WorkingTreeCommandState<WorktreeView>>;
```

Defined in: [use-worktrees.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L42)

Phase of the last `attach()`; **no empty**.

---

### list \{#list\}

```ts
readonly list: () => Promise<readonly Worktree[]>;
```

Defined in: [use-worktrees.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L60)

Reads the registered checkouts.

#### Returns

`Promise`&lt;readonly [`Worktree`](../../rxdb-plugin-working-tree/classes/Worktree.md)[]&gt;

---

### listState \{#liststate\}

```ts
readonly listState: Signal<WorkingTreeQueryState<readonly Worktree[]>>;
```

Defined in: [use-worktrees.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L38)

Phase of the last `list()`; no registered checkouts is `empty`.

---

### mount \{#mount\}

```ts
readonly mount: (id) => Promise<void>;
```

Defined in: [use-worktrees.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L70)

Makes the main instance mount a writable checkout; then automatically re-reads the registry.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

#### Returns

`Promise`&lt;`void`&gt;

---

### mounted \{#mounted\}

```ts
readonly mounted: Signal<WorktreeTableSet>;
```

Defined in: [use-worktrees.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L58)

The table set this instance currently has mounted; changes only after a remount finishes, and after a rebuild it is a new instance with the same suffix.

---

### mountMain \{#mountmain\}

```ts
readonly mountMain: () => Promise<void>;
```

Defined in: [use-worktrees.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L72)

Makes the main instance mount back the main checkout.

#### Returns

`Promise`&lt;`void`&gt;

---

### mountMainState \{#mountmainstate\}

```ts
readonly mountMainState: Signal<WorkingTreeCommandState<void>>;
```

Defined in: [use-worktrees.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L50)

Phase of the last `mountMain()`.

---

### mountState \{#mountstate\}

```ts
readonly mountState: Signal<WorkingTreeCommandState<void>>;
```

Defined in: [use-worktrees.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L48)

Phase of the last `mount()`.

---

### open \{#open\}

```ts
readonly open: (target, options?) => Promise<WorktreeView>;
```

Defined in: [use-worktrees.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L62)

Opens a read-only checkout; then automatically re-reads the registry.

#### Parameters

| Parameter  | Type                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------- |
| `target`   | [`WorktreeTarget`](../../rxdb-plugin-working-tree/type-aliases/WorktreeTarget.md)         |
| `options?` | [`WorktreeOpenOptions`](../../rxdb-plugin-working-tree/interfaces/WorktreeOpenOptions.md) |

#### Returns

`Promise`&lt;[`WorktreeView`](../../rxdb-plugin-working-tree/interfaces/WorktreeView.md)&gt;

---

### openState \{#openstate\}

```ts
readonly openState: Signal<WorkingTreeCommandState<WorktreeView>>;
```

Defined in: [use-worktrees.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L40)

Phase of the last `open()`; **no empty**.

---

### prune \{#prune\}

```ts
readonly prune: () => Promise<readonly string[]>;
```

Defined in: [use-worktrees.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L66)

Reclaims checkouts that nobody is using (including orphan table sets without registry rows); then automatically re-reads the registry.

#### Returns

`Promise`&lt;readonly `string`[]&gt;

---

### pruneState \{#prunestate\}

```ts
readonly pruneState: Signal<WorkingTreeCommandState<readonly string[]>>;
```

Defined in: [use-worktrees.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L44)

Phase of the last `prune()`; reclaiming zero is also a result.

---

### release \{#release\}

```ts
readonly release: (id) => Promise<void>;
```

Defined in: [use-worktrees.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L74)

Gives up the claim on a writable checkout.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

#### Returns

`Promise`&lt;`void`&gt;

---

### releaseState \{#releasestate\}

```ts
readonly releaseState: Signal<WorkingTreeCommandState<void>>;
```

Defined in: [use-worktrees.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L52)

Phase of the last `release()`.

---

### remove \{#remove\}

```ts
readonly remove: (id) => Promise<void>;
```

Defined in: [use-worktrees.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L76)

Deletes a writable checkout (uncommitted changes stay on the branch it holds); then automatically re-reads the registry.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

#### Returns

`Promise`&lt;`void`&gt;

---

### removeState \{#removestate\}

```ts
readonly removeState: Signal<WorkingTreeCommandState<void>>;
```

Defined in: [use-worktrees.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L54)

Phase of the last `remove()`.

---

### rename \{#rename\}

```ts
readonly rename: (id, name) => Promise<Worktree>;
```

Defined in: [use-worktrees.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L78)

Renames a writable checkout; then automatically re-reads the registry.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |
| `name`    | `string` |

#### Returns

`Promise`&lt;[`Worktree`](../../rxdb-plugin-working-tree/classes/Worktree.md)&gt;

---

### renameState \{#renamestate\}

```ts
readonly renameState: Signal<WorkingTreeCommandState<Worktree>>;
```

Defined in: [use-worktrees.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L56)

Phase of the last `rename()`: the registry row after the rename.
