# describeBoardFailure()

```ts
function describeBoardFailure(error): string;
```

Defined in: [packages/rxdb-plugin-board/src/write-notifier.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/write-notifier.ts#L35)

Reduces any error to a displayable reason: stable error codes first (`reason` / `code`), never parses message text.

## Parameters

| Parameter | Type      |
| --------- | --------- |
| `error`   | `unknown` |

## Returns

`string`
