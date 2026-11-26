# gateRawWrite()

```ts
function gateRawWrite<T>(
   sql, 
   context, 
   execute
): Promise<T>;
```

Defined in: [packages/rxdb/src/capture/raw-write-gate.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/raw-write-gate.ts#L79)

Adjudicates a raw write; the statement is executed only when it is allowed through

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | The return type of the statement executor; the gate passes it through unchanged, without any wrapping |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sql` | `string` | The raw text of the statement to be adjudicated |
| `context` | [`RawWriteContext`](../type-aliases/RawWriteContext.md) | Taken from `RxDBAdapterLocalBase.workingTreeRawWriteContext` |
| `execute` | () => `T` \| `Promise`&lt;`T`&gt; | The statement executor, **not yet invoked** |

## Returns

`Promise`&lt;`T`&gt;

The return value of `execute()` itself

## Throws

Thrown when the commit capability is enabled and the adjudication lands on rejection; in that case `execute` is never called

## Remarks

When not enabled, **it goes synchronously straight to `execute()` with no extra indirection**: FR-046 requires byte-for-byte parity with a database that does not have the commit capability enabled — and with one that lacks this version entirely — while "an extra layer before letting it through" is observable inside transactions.

## Example

```ts
override rawQuery<T>(sql: string): Promise<T> {
  return gateRawWrite(sql, this.workingTreeRawWriteContext, () => this.#exec<T>(sql));
}
```
