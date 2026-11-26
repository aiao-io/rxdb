# trackWorkingTreeCommand()

```ts
function trackWorkingTreeCommand<T>(emit, run): Promise<T>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:222](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L222)

Runs a command, emitting loading → success | error along the way.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type                                                                                                                                                        | Description          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `emit`    | [`WorkingTreeStateSink`](../type-aliases/WorkingTreeStateSink.md)&lt;[`WorkingTreeCommandState`](../type-aliases/WorkingTreeCommandState.md)&lt;`T`&gt;&gt; | Where the state goes |
| `run`     | () => `Promise`&lt;`T`&gt;                                                                                                                                  | The real call        |

## Returns

`Promise`&lt;`T`&gt;

The return value of `run`

## Throws

The **original** error thrown by `run`

## Remarks

**`loading` is emitted synchronously before `run()`**, not after the first `await`: there must be no silence during
`commit()` (§4), and "emit a loading after the result comes back" would mean the whole waiting period has no state.

**Errors are still rethrown upward**, not swallowed into a call that has only state and no exception: the caller's `await commit()`
must be able to reject, otherwise "commit failed" is only known to the part of the UI subscribed to the state.
