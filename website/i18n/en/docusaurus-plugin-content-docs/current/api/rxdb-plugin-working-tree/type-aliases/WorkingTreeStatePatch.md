# WorkingTreeStatePatch

```ts
type WorkingTreeStatePatch = <K>(key, state) => void;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L60)

Writes a new phase into one state slot.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-__typek"></a> `K` *extends* keyof [`WorkingTreeAsyncStates`](../interfaces/WorkingTreeAsyncStates.md) |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `K` |
| `state` | [`WorkingTreeAsyncStates`](../interfaces/WorkingTreeAsyncStates.md)\[`K`\] |

## Returns

`void`

## Remarks

Slot by key rather than replacing the whole object: while `commit()` is in flight, `statusState` should not also become `loading`,
and whole-object replacement either has to achieve that, or force each framework to hand-assemble a "keep the other six slots" spread.
