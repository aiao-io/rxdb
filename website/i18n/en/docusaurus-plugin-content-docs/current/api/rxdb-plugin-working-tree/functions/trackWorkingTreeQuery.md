# trackWorkingTreeQuery()

```ts
function trackWorkingTreeQuery<T>(emit, isEmpty, run): Promise<T>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:250](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L250)

Runs a query once, emitting loading → success | empty | error along the way.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type                                                                                                                                                    | Description                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `emit`    | [`WorkingTreeStateSink`](../type-aliases/WorkingTreeStateSink.md)&lt;[`WorkingTreeQueryState`](../type-aliases/WorkingTreeQueryState.md)&lt;`T`&gt;&gt; | Where the state goes                                          |
| `isEmpty` | (`value`) => `boolean`                                                                                                                                  | The emptiness predicate; evaluated only on successful results |
| `run`     | () => `Promise`&lt;`T`&gt;                                                                                                                              | The actual call                                               |

## Returns

`Promise`&lt;`T`&gt;

`run`'s return value

## Throws

The error thrown by `run`, **as-is**

## Remarks

Emptiness is evaluated **only on successful results**: a failed query doesn't know whether it is empty, and emitting empty before error makes the UI flash the empty-state illustration.
