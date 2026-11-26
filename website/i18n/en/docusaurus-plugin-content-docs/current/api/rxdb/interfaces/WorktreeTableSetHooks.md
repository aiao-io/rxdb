# WorktreeTableSetHooks

Defined in: [packages/rxdb/src/rxdb-plugin.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L14)

A plugin's contribution to the writable checkout table sets (US-314 B2.5).

## Remarks

When a plugin builds auxiliary objects on business tables (like full-text indexes), each writable checkout's shadow tables also need a copy, otherwise nothing can be found once the checkout is mounted.
Called by the table-set creator through [RxDB.notifyWorktreeTableSetCreated](../classes/RxDB.md#notifyworktreetablesetcreated) within the same transaction.

## Methods

### created() \{#created\}

```ts
created(executor, tableSet): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-plugin.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L21)

A writable checkout's tables have just been created and seeded, still inside the transaction that created them.

#### Parameters

| Parameter  | Type                                                 | Description                                                                                                                                                        |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `executor` | [`TransactionExecutor`](TransactionExecutor.md)      | The table-creating transaction; build the auxiliary objects on it, and throwing rolls back the whole transaction                                                   |
| `tableSet` | [`WorktreeTableSet`](../classes/WorktreeTableSet.md) | The table set just created. The executor's `tableSet` is the one mounted by the instance that initiated the transaction (usually the main table set), not this one |

#### Returns

`Promise`&lt;`void`&gt;

---

### fingerprint() \{#fingerprint\}

```ts
fingerprint(tableSet): string;
```

Defined in: [packages/rxdb/src/rxdb-plugin.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L32)

What the auxiliary objects this plugin built on this table set look like (US-314 B2.6), folded into the checkout's fingerprint.

#### Parameters

| Parameter  | Type                                                 | Description                                               |
| ---------- | ---------------------------------------------------- | --------------------------------------------------------- |
| `tableSet` | [`WorktreeTableSet`](../classes/WorktreeTableSet.md) | That table set; looks only at its members, not the suffix |

#### Returns

`string`

Any string: it must change when the shape of the auxiliary objects changes (the tokenizer version of a full-text index, the entities and fields indexed, and the like)

#### Remarks

When a checkout mounts and the fingerprint does not match, the whole set is rebuilt, and [WorktreeTableSetHooks.created](#created) reruns with it. Depends only on configuration, not on database state.
