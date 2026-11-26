# WorktreeCommands

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L74)

The checkout commands exposed by the three binding entry points; signatures match the same-named methods on [WorktreeManager](../classes/WorktreeManager.md).

## Properties

### add \{#add\}

```ts
readonly add: (branchId, options?) => Promise<Worktree>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L84)

Opens a writable checkout: registers, holds the branch, creates tables, seeds; after creation it is not mounted, this context claims it

#### Parameters

| Parameter  | Type                                          |
| ---------- | --------------------------------------------- |
| `branchId` | `string`                                      |
| `options?` | [`WorktreeAddOptions`](WorktreeAddOptions.md) |

#### Returns

`Promise`&lt;[`Worktree`](../classes/Worktree.md)&gt;

---

### attach \{#attach\}

```ts
readonly attach: (id) => Promise<WorktreeView>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L80)

Re-opens a persistently owned checkout

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

#### Returns

`Promise`&lt;[`WorktreeView`](WorktreeView.md)&gt;

---

### list \{#list\}

```ts
readonly list: () => Promise<readonly Worktree[]>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L76)

The registered checkouts; re-read as a side effect after successful open, re-open, close, release and prune

#### Returns

`Promise`&lt;readonly [`Worktree`](../classes/Worktree.md)[]&gt;

---

### mount \{#mount\}

```ts
readonly mount: (id) => Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L86)

Makes the main instance mount a writable checkout; rebuilds it in the mounting transaction when the fingerprint disagrees

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

#### Returns

`Promise`&lt;`void`&gt;

---

### mountMain \{#mountmain\}

```ts
readonly mountMain: () => Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L88)

Makes the main instance mount back onto the main checkout

#### Returns

`Promise`&lt;`void`&gt;

---

### open \{#open\}

```ts
readonly open: (target, options?) => Promise<WorktreeView>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L78)

Opens a read-only checkout; the registry is likewise re-read after the returned view's `close()` / `release()` / `refresh()`

#### Parameters

| Parameter  | Type                                                  |
| ---------- | ----------------------------------------------------- |
| `target`   | [`WorktreeTarget`](../type-aliases/WorktreeTarget.md) |
| `options?` | [`WorktreeOpenOptions`](WorktreeOpenOptions.md)       |

#### Returns

`Promise`&lt;[`WorktreeView`](WorktreeView.md)&gt;

---

### prune \{#prune\}

```ts
readonly prune: () => Promise<readonly string[]>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L82)

Reclaims checkouts nobody is using (including orphan table sets with no registry row)

#### Returns

`Promise`&lt;readonly `string`[]&gt;

---

### release \{#release\}

```ts
readonly release: (id) => Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L90)

Gives up a claim on a writable checkout

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

#### Returns

`Promise`&lt;`void`&gt;

---

### remove \{#remove\}

```ts
readonly remove: (id) => Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L92)

Deletes a writable checkout; uncommitted changes remain on the branch it holds

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

#### Returns

`Promise`&lt;`void`&gt;

---

### rename \{#rename\}

```ts
readonly rename: (id, name) => Promise<Worktree>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L94)

Renames a writable checkout

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |
| `name`    | `string` |

#### Returns

`Promise`&lt;[`Worktree`](../classes/Worktree.md)&gt;
