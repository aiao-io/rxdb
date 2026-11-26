# WorkingTreeStatePatch

```ts
type WorkingTreeStatePatch = <K>(key, state) => void;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L60)

Writing a new phase into a state slot.

## Type Parameters

| Type Parameter                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-__typek"></a> `K` _extends_ keyof [`WorkingTreeAsyncStates`](../interfaces/WorkingTreeAsyncStates.md) |

## Parameters

| Parameter | Type                                                                       |
| --------- | -------------------------------------------------------------------------- |
| `key`     | `K`                                                                        |
| `state`   | [`WorkingTreeAsyncStates`](../interfaces/WorkingTreeAsyncStates.md)\[`K`\] |

## Returns

`void`

## Remarks

Per-key slots rather than wholesale replacement: while `commit()` is in flight, `statusState` should not
turn `loading` too — and wholesale replacement would either have to guarantee that, or force every framework
to hand-assemble a "keep the other six slots" spread of its own.
