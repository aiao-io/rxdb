# applyRawWriteJudgment()

```ts
function applyRawWriteJudgment<T>(
   sql, 
   context, 
   execute
): Promise<T>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts:836](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts#L836)

Judges and, when allowed, executes the statements; the body of the capture runtime's `gateRawWrite()`

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | The executor's return type |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sql` | `string` | The raw statement |
| `context` | [`RawWriteJudgmentContext`](../interfaces/RawWriteJudgmentContext.md) | The judgment context |
| `execute` | () => `T` \| `Promise`&lt;`T`&gt; | The executor that really dispatches the statement |

## Returns

`Promise`&lt;`T`&gt;

The executor's return value, passed through unchanged

## Throws

[WorkingTreeWriteRejectedError](../classes/WorkingTreeWriteRejectedError.md) thrown when it lands on step 3, and **the executor is never called**

## Remarks

The rejection happens **before** the statement is dispatched, leaving business tables untouched — it is not a
rollback after the write. The raw channel has no transaction to roll back at all, which is precisely why the
raw channel exists.

It is not named `gateRawWrite`: that name belongs to the core's seam function — adapters call it, and the
imports at the six call sites spell it. Two functions of the same name, one in the core and one in the
plugin, would let a change to the wrong one compile cleanly.
