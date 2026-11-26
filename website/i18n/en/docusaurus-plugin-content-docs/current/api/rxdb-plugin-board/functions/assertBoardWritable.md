# assertBoardWritable()

```ts
function assertBoardWritable(ctx): void;
```

Defined in: [packages/rxdb-plugin-board/src/host-context.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/host-context.ts#L24)

Write gate while restoring: all application write entries (create / edit / delete / move / column sort /
undo redo / restore again) pass through this first at the domain service layer (US-534 AC#10).

## Parameters

| Parameter | Type                                                    |
| --------- | ------------------------------------------------------- |
| `ctx`     | [`BoardHostContext`](../interfaces/BoardHostContext.md) |

## Returns

`void`
