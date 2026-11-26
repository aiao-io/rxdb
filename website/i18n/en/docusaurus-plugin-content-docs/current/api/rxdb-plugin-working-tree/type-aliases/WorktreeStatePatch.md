# WorktreeStatePatch

```ts
type WorktreeStatePatch = <K>(key, state) => void;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L71)

Writes a new phase into one state slot.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-__typek"></a> `K` *extends* keyof [`WorktreeAsyncStates`](../interfaces/WorktreeAsyncStates.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `K` | Which slot |
| `state` | [`WorktreeAsyncStates`](../interfaces/WorktreeAsyncStates.md)\[`K`\] | The new phase |

## Returns

`void`
