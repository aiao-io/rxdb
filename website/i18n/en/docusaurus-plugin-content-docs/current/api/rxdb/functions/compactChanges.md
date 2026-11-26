# compactChanges()

```ts
function compactChanges<T>(changes, actions?): SwitchVersionActions;
```

Defined in: [packages/rxdb/src/sync-contract/compact-changes.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/compact-changes.ts#L46)

Compacts a change list into SwitchVersionActions (specialized for the Push scenario).

Uses state-machine logic to process change compaction, specialized for the Push scenario:
- Data created locally and then deleted (INSERT → DELETE with `inversePatch` null) does not need to be pushed
- Deletion of data that already exists remotely (`inversePatch` not null) must push a DELETE

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`IRxDBChange`](../interfaces/IRxDBChange.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `changes` | `T`[] | The raw change list (sorted by id automatically) |
| `actions?` | [`SwitchVersionActions`](../interfaces/SwitchVersionActions.md) | - |

## Returns

[`SwitchVersionActions`](../interfaces/SwitchVersionActions.md)

The compacted operation set.

## Example

```typescript
// Scenario 1: created locally and then deleted (no push needed)
const changes1 = [
  { type: 'INSERT', entityId: '1', patch: { name: 'Alice' }, inversePatch: null },
  `{ type: 'DELETE', entityId: '1', patch: null, inversePatch: null }`
];
const actions1 = compactChanges(changes1);
// actions1.deletes.size === 0 (local data the server has never seen; no need to notify deletion)

// Scenario 2: remote data deleted (must push DELETE)
const changes2 = [
  { type: 'UPDATE', entityId: '1', patch: { name: 'Bob' }, inversePatch: { name: 'Alice' } },
  `{ type: 'DELETE', entityId: '1', patch: null, inversePatch: { name: 'Bob' } }`
];
const actions2 = compactChanges(changes2);
// actions2.deletes.size === 1 (the server has this data; deletion must be notified)
```

## Remarks

**Compaction rules (Push-only)**:
- `INSERT → DELETE` + `inversePatch === null` → cancel out (created locally, the server has never seen it)
- `INSERT → DELETE` + `inversePatch !== null` → keep the DELETE (the server already has the old data)
- `INSERT → UPDATE*` → merge into INSERT (insert the final state at once)
- `UPDATE → UPDATE*` → merge into UPDATE (merge all patches)
- `UPDATE → DELETE` → keep the DELETE (the server must know the data was deleted)

**Difference from `get_switch_version_actions`**:
- `get_switch_version_actions`: branch switch scenario, `INSERT → DELETE` cancels out completely
- `compactChanges`: Push scenario, decides whether the server must be notified based on `inversePatch`
