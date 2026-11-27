# isDevToolsMessage()

```ts
function isDevToolsMessage(data): data is AnyDevToolsMessage;
```

Defined in: [types.ts:644](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L644)

Strictly validates the message envelope, direction, known type, and command payload.

## Parameters

| Parameter | Type      |
| --------- | --------- |
| `data`    | `unknown` |

## Returns

`data is AnyDevToolsMessage`
