# isDevToolsCommandMessage()

```ts
function isDevToolsCommandMessage(message): message is DevToolsCommandMessage;
```

Defined in: [types.ts:697](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L697)

Checks whether a legal message is a command allowed into the page handler.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | [`AnyDevToolsMessage`](../type-aliases/AnyDevToolsMessage.md) |

## Returns

`message is DevToolsCommandMessage`

## Remarks

**This is not an authorization check.** `direction` is merely a self-declared sender field that any same-origin script can fill in freely.
The real authorization boundary is [DevToolsCapability](../type-aliases/DevToolsCapability.md).
