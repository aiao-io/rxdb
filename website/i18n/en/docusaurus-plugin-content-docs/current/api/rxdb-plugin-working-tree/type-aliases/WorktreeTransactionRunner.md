# WorktreeTransactionRunner

```ts
type WorktreeTransactionRunner = <T>(run, signal?) => Promise<T>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:149](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L149)

Managed transaction of the working tree facade: reads the capability bit, passes the gate, then hands the executor and this epoch's adapter to the command body.

## Type Parameters

| Type Parameter                          |
| --------------------------------------- |
| <a id="type-parameter-__typet"></a> `T` |

## Parameters

| Parameter | Type                                            | Description                                                                                      |
| --------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `run`     | (`executor`, `adapter`) => `Promise`&lt;`T`&gt; | The command body                                                                                 |
| `signal?` | `AbortSignal`                                   | Cancels the wait for the adapter; a command already inside the transaction still needs to finish |

## Returns

`Promise`&lt;`T`&gt;

The command body's return value
