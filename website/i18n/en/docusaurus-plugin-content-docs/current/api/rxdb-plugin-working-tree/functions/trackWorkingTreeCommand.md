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

| Parameter | Type                                                                                                                                                        | Description      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `emit`    | [`WorkingTreeStateSink`](../type-aliases/WorkingTreeStateSink.md)&lt;[`WorkingTreeCommandState`](../type-aliases/WorkingTreeCommandState.md)&lt;`T`&gt;&gt; | Where state goes |
| `run`     | () => `Promise`&lt;`T`&gt;                                                                                                                                  | The real call    |

## Returns

`Promise`&lt;`T`&gt;

`run`'s return value

## Throws

`run`'s error, thrown **unchanged**

## Remarks

**`loading` is emitted synchronously before `run()`**, not after the first `await`: `commit()` must not be
silent while in flight (§4), and "add a loading after the result comes back" means the entire wait has no
state at all.

**Errors are still thrown upward**, not swallowed into a state-only call with no exception: the caller's
`await commit()` must be able to reject, otherwise "the commit failed" is only known to the part of the UI
that subscribed to the state.
