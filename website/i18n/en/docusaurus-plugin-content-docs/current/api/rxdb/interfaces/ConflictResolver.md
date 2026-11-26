# ConflictResolver

Defined in: [packages/rxdb/src/sync-contract/conflict.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/conflict.ts#L72)

Conflict resolver interface

Customizable. Note that the only resolution results the runtime can apply automatically are `KEEP_LOCAL` and `KEEP_REMOTE`;
returning `MERGE` / `DEFER` rolls back this whole pull round, see [ConflictResolution](../type-aliases/ConflictResolution.md) for details.

Passed in through [PullOptions.conflictResolver](PullOptions.md#conflictresolver) or [PullRepositoryOptions.conflictResolver](PullRepositoryOptions.md#conflictresolver);
[LWWConflictResolver](../classes/LWWConflictResolver.md) is used when not provided.

## Example

**Interactive selection (the return value must still land on one of the two applicable results)**

```typescript
class MyResolver implements ConflictResolver {
  async resolve(conflict: Conflict): Promise<ConflictResolution> {
    const keepLocal = await showConflictDialog(conflict);
    return { type: keepLocal ? 'KEEP_LOCAL' : 'KEEP_REMOTE' };
  }
}
```

## Methods

### resolve() \{#resolve\}

```ts
resolve(conflict): Promise<ConflictResolution>;
```

Defined in: [packages/rxdb/src/sync-contract/conflict.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/conflict.ts#L79)

Resolves a single conflict

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `conflict` | [`Conflict`](Conflict.md) | Conflict information |

#### Returns

`Promise`&lt;[`ConflictResolution`](../type-aliases/ConflictResolution.md)&gt;

The conflict resolution result

***

### resolveAll()? \{#resolveall\}

```ts
resolveAll?(conflicts): Promise<ConflictResolution[]>;
```

Defined in: [packages/rxdb/src/sync-contract/conflict.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/conflict.ts#L89)

Resolves conflicts in bulk (optional optimization)

The default implementation calls resolve() one by one

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `conflicts` | [`Conflict`](Conflict.md)[] | The conflict list |

#### Returns

`Promise`&lt;[`ConflictResolution`](../type-aliases/ConflictResolution.md)[]&gt;

The list of resolution results
