# WorktreeAsyncStates

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L28)

The per-slot async states of the checkout entry points.

## Properties

### addState \{#addstate\}

```ts
readonly addState: WorkingTreeCommandState<Worktree>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L38)

The state of `add()`: the registration row of the created writable checkout

---

### attachState \{#attachstate\}

```ts
readonly attachState: WorkingTreeCommandState<WorktreeView>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L34)

The state of `attach()`; **no empty**

---

### listState \{#liststate\}

```ts
readonly listState: WorkingTreeQueryState<readonly Worktree[]>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L30)

The state of `list()`; empty means "no registered checkouts"

---

### mountMainState \{#mountmainstate\}

```ts
readonly mountMainState: WorkingTreeCommandState<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L42)

The state of `mountMain()`

---

### mountState \{#mountstate\}

```ts
readonly mountState: WorkingTreeCommandState<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L40)

The state of `mount()`

---

### openState \{#openstate\}

```ts
readonly openState: WorkingTreeCommandState<WorktreeView>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L32)

The state of `open()`; **no empty**

---

### pruneState \{#prunestate\}

```ts
readonly pruneState: WorkingTreeCommandState<readonly string[]>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L36)

The state of `prune()`; reclaiming zero is also a result, not empty

---

### releaseState \{#releasestate\}

```ts
readonly releaseState: WorkingTreeCommandState<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L44)

The state of `release()`

---

### removeState \{#removestate\}

```ts
readonly removeState: WorkingTreeCommandState<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L46)

The state of `remove()`

---

### renameState \{#renamestate\}

```ts
readonly renameState: WorkingTreeCommandState<Worktree>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L48)

The state of `rename()`: the registration row after the rename
