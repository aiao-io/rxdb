# applyRawWriteJudgment()

```ts
function applyRawWriteJudgment<T>(
   sql, 
   context, 
   execute
): Promise<T>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts:836](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts#L836)

Judges, and executes the statement when allowed; implementation of the capture runtime's `gateRawWrite()`

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | Return type of the executor |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sql` | `string` | The original statement |
| `context` | [`RawWriteJudgmentContext`](../interfaces/RawWriteJudgmentContext.md) | Judgment context |
| `execute` | () => `T` \| `Promise`&lt;`T`&gt; | The executor that actually issues the statement |

## Returns

`Promise`&lt;`T`&gt;

The executor's return value, passed through as-is

## Throws

[WorkingTreeWriteRejectedError](../classes/WorkingTreeWriteRejectedError.md) thrown when it lands on step 3; the **executor is never called even once**

## Remarks

The rejection happens **before** the statement is issued; business tables are completely unchanged — not write-then-rollback. On the raw channel there is no transaction to roll back at all,
and that is exactly why the raw channel exists.

The name is not `gateRawWrite`: that name belongs to the core's seam function — adapters call it, and the six call sites' imports
also spell it. Two same-name functions, one in the core and one in the plugin, would produce no compile error when the wrong one is edited.
