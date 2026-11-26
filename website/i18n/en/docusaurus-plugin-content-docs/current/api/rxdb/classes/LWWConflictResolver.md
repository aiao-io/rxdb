# LWWConflictResolver

Defined in: [packages/rxdb/src/sync-contract/LWWConflictResolver.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/LWWConflictResolver.ts#L27)

Last-Write-Wins conflict resolver

Compares the `createdAt` (edit time) of both sides' changes; the later change wins.
This is the default conflict resolution strategy

## Remarks

Both sides must be the same kind of time: the local side is the edit time of the machine's pending changes, the remote side is the edit time when the pusher wrote them,
the remote adapter must preserve `createdAt` as-is when pushing (Supabase records the push time separately in `updatedAt`).
If rewritten to the push time, a side that pushed after being offline for a long time would beat others' later edits by its push time.
Timestamps on both sides come from different devices' clocks, and a device with a fast clock gains an edge in conflicts — an inherent limitation of LWW.

## Example

```typescript
const resolver = new LWWConflictResolver();
const resolution = await resolver.resolve(conflict);

if (resolution.type === 'KEEP_LOCAL') {
  // use the local change
} else {
  // use the remote change
}
```

## Implements

- [`ConflictResolver`](../interfaces/ConflictResolver.md)

## Constructors

### Constructor

```ts
new LWWConflictResolver(): LWWConflictResolver;
```

#### Returns

`LWWConflictResolver`

## Methods

### resolve() \{#resolve\}

```ts
resolve(conflict): Promise<ConflictResolution>;
```

Defined in: [packages/rxdb/src/sync-contract/LWWConflictResolver.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/LWWConflictResolver.ts#L41)

Resolves a single conflict

Compares the createdAt timestamps of the local and remote changes; the later one wins.

When the timestamps are equal, the tie is broken by `clientId` lexicographic order — this is **globally deterministic**: the two replicas
see the same pair of clientIds from their own perspectives, so they converge to the same data after resolving independently.
A fixed "local wins" would make both A and B keep their own, diverging permanently and re-conflicting on every sync.
When `clientId` is missing or identical on both sides there is nothing to discriminate by, and it falls back to local-wins.

#### Parameters

| Parameter  | Type                                    | Description          |
| ---------- | --------------------------------------- | -------------------- |
| `conflict` | [`Conflict`](../interfaces/Conflict.md) | Conflict information |

#### Returns

`Promise`&lt;[`ConflictResolution`](../type-aliases/ConflictResolution.md)&gt;

Conflict resolution result

#### Implementation of

[`ConflictResolver`](../interfaces/ConflictResolver.md).[`resolve`](../interfaces/ConflictResolver.md#resolve)

---

### resolveAll() \{#resolveall\}

```ts
resolveAll(conflicts): Promise<ConflictResolution[]>;
```

Defined in: [packages/rxdb/src/sync-contract/LWWConflictResolver.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/LWWConflictResolver.ts#L73)

Resolves conflicts in a batch

Calls resolve() one by one

#### Parameters

| Parameter   | Type                                      | Description       |
| ----------- | ----------------------------------------- | ----------------- |
| `conflicts` | [`Conflict`](../interfaces/Conflict.md)[] | The conflict list |

#### Returns

`Promise`&lt;[`ConflictResolution`](../type-aliases/ConflictResolution.md)[]&gt;

The resolution result list

#### Implementation of

[`ConflictResolver`](../interfaces/ConflictResolver.md).[`resolveAll`](../interfaces/ConflictResolver.md#resolveall)
