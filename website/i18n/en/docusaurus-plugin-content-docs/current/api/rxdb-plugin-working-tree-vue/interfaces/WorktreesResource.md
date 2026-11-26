# WorktreesResource

Defined in: [use-worktrees.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L35)

Checkout entry point returned by [useWorktrees](../functions/useWorktrees.md) (read-only checkouts US-313, writable checkouts US-314).

## Remarks

The ten state cells correspond one-to-one with the core `WorktreeAsyncStates`, each wrapped in a `ComputedRef`; the method signatures match the same-named methods on the plugin package's `WorktreeManager`. Same names, same fields and same signatures across the three frameworks: React `useWorktrees()` (render snapshot), Angular `useWorktrees()` (`Signal`). The entry point binds the database injected at `setup()` time: when the source of `provideRxDB()` changes databases, this still points at the old database — to follow the switch, add `:key` to the components that use it so they rebuild with the database (the React version resets itself when the Provider switches databases).

For the view obtained by opening, hand `view.rxdb` to `provideRxDB()` and existing composables keep working; queries must use the classes swapped in via `view.entityOf()`.

`mounted` is the table set this instance currently has mounted (`rxdb.worktreeTableSet$`; it changes only after a remount finishes and the entity caches are cleared): `mounted.value.isMain` means the main checkout is mounted, and the registry row of a writable checkout whose `tableSetSuffix === mounted.value.suffix` is the mounted one; the current branch is the entry whose `activeKey === mounted.value.holderKey`. After a remount, the cells of `useWorkingTree()` do not re-read by themselves; components that need to follow should `watch(mounted)` and re-read.

## Properties

### add \{#add\}

```ts
readonly add: (branchId, options?) => Promise<Worktree>;
```

Defined in: [use-worktrees.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L67)

Creates a writable checkout (created but not mounted; this context claims it); then automatically re-reads the registry.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `branchId` | `string` |
| `options?` | [`WorktreeAddOptions`](../../rxdb-plugin-working-tree/interfaces/WorktreeAddOptions.md) |

#### Returns

`Promise`&lt;[`Worktree`](../../rxdb-plugin-working-tree/classes/Worktree.md)&gt;

***

### addState \{#addstate\}

```ts
readonly addState: ComputedRef<WorkingTreeCommandState<Worktree>>;
```

Defined in: [use-worktrees.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L45)

Phase of the last `add()`: the registry row of the created writable checkout.

***

### attach \{#attach\}

```ts
readonly attach: (id) => Promise<WorktreeView>;
```

Defined in: [use-worktrees.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L63)

Opens another persistently-owned checkout; then automatically re-reads the registry.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

`Promise`&lt;[`WorktreeView`](../../rxdb-plugin-working-tree/interfaces/WorktreeView.md)&gt;

***

### attachState \{#attachstate\}

```ts
readonly attachState: ComputedRef<WorkingTreeCommandState<WorktreeView>>;
```

Defined in: [use-worktrees.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L41)

Phase of the last `attach()`; **no empty**.

***

### list \{#list\}

```ts
readonly list: () => Promise<readonly Worktree[]>;
```

Defined in: [use-worktrees.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L59)

Reads the registered checkouts.

#### Returns

`Promise`&lt;readonly [`Worktree`](../../rxdb-plugin-working-tree/classes/Worktree.md)[]&gt;

***

### listState \{#liststate\}

```ts
readonly listState: ComputedRef<WorkingTreeQueryState<readonly Worktree[]>>;
```

Defined in: [use-worktrees.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L37)

Phase of the last `list()`; no registered checkouts is `empty`.

***

### mount \{#mount\}

```ts
readonly mount: (id) => Promise<void>;
```

Defined in: [use-worktrees.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L69)

Makes the main instance mount a writable checkout; then automatically re-reads the registry.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

`Promise`&lt;`void`&gt;

***

### mounted \{#mounted\}

```ts
readonly mounted: ComputedRef<WorktreeTableSet>;
```

Defined in: [use-worktrees.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L57)

The table set this instance currently has mounted; changes only after a remount finishes, and after a rebuild it is a new instance with the same suffix.

***

### mountMain \{#mountmain\}

```ts
readonly mountMain: () => Promise<void>;
```

Defined in: [use-worktrees.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L71)

Makes the main instance mount back the main checkout.

#### Returns

`Promise`&lt;`void`&gt;

***

### mountMainState \{#mountmainstate\}

```ts
readonly mountMainState: ComputedRef<WorkingTreeCommandState<void>>;
```

Defined in: [use-worktrees.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L49)

Phase of the last `mountMain()`.

***

### mountState \{#mountstate\}

```ts
readonly mountState: ComputedRef<WorkingTreeCommandState<void>>;
```

Defined in: [use-worktrees.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L47)

Phase of the last `mount()`.

***

### open \{#open\}

```ts
readonly open: (target, options?) => Promise<WorktreeView>;
```

Defined in: [use-worktrees.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L61)

Opens a read-only checkout; then automatically re-reads the registry.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `target` | [`WorktreeTarget`](../../rxdb-plugin-working-tree/type-aliases/WorktreeTarget.md) |
| `options?` | [`WorktreeOpenOptions`](../../rxdb-plugin-working-tree/interfaces/WorktreeOpenOptions.md) |

#### Returns

`Promise`&lt;[`WorktreeView`](../../rxdb-plugin-working-tree/interfaces/WorktreeView.md)&gt;

***

### openState \{#openstate\}

```ts
readonly openState: ComputedRef<WorkingTreeCommandState<WorktreeView>>;
```

Defined in: [use-worktrees.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L39)

Phase of the last `open()`; **no empty**.

***

### prune \{#prune\}

```ts
readonly prune: () => Promise<readonly string[]>;
```

Defined in: [use-worktrees.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L65)

Reclaims checkouts that nobody is using (including orphan table sets without registry rows); then automatically re-reads the registry.

#### Returns

`Promise`&lt;readonly `string`[]&gt;

***

### pruneState \{#prunestate\}

```ts
readonly pruneState: ComputedRef<WorkingTreeCommandState<readonly string[]>>;
```

Defined in: [use-worktrees.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L43)

Phase of the last `prune()`; reclaiming zero is also a result.

***

### release \{#release\}

```ts
readonly release: (id) => Promise<void>;
```

Defined in: [use-worktrees.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L73)

Gives up the claim on a writable checkout.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

`Promise`&lt;`void`&gt;

***

### releaseState \{#releasestate\}

```ts
readonly releaseState: ComputedRef<WorkingTreeCommandState<void>>;
```

Defined in: [use-worktrees.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L51)

Phase of the last `release()`.

***

### remove \{#remove\}

```ts
readonly remove: (id) => Promise<void>;
```

Defined in: [use-worktrees.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L75)

Deletes a writable checkout (uncommitted changes stay on the branch it holds); then automatically re-reads the registry.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

`Promise`&lt;`void`&gt;

***

### removeState \{#removestate\}

```ts
readonly removeState: ComputedRef<WorkingTreeCommandState<void>>;
```

Defined in: [use-worktrees.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L53)

Phase of the last `remove()`.

***

### rename \{#rename\}

```ts
readonly rename: (id, name) => Promise<Worktree>;
```

Defined in: [use-worktrees.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L77)

Renames a writable checkout; then automatically re-reads the registry.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `name` | `string` |

#### Returns

`Promise`&lt;[`Worktree`](../../rxdb-plugin-working-tree/classes/Worktree.md)&gt;

***

### renameState \{#renamestate\}

```ts
readonly renameState: ComputedRef<WorkingTreeCommandState<Worktree>>;
```

Defined in: [use-worktrees.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-worktrees.ts#L55)

Phase of the last `rename()`: the registry row after the rename.
