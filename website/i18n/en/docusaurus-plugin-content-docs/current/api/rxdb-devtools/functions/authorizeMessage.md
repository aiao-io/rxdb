# authorizeMessage()

```ts
function authorizeMessage(type, capability): boolean;
```

Defined in: [v2/authorization.ts:147](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/authorization.ts#L147)

Checks whether a message type can be sent or received under a given tier.

## Parameters

| Parameter    | Type                                                                                                                                                                                                                                                                                 | Description                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `type`       | \| `"HANDSHAKE"` \| `"HANDSHAKE_ACK"` \| `"EVENT"` \| `"DISCONNECT"` \| `"PING"` \| `"PROTOCOL_HELLO"` \| `"PONG"` \| `"CLEAR_EVENT_BUFFER"` \| `"REQUEST"` \| `"RESPONSE"` \| `"ERROR"` \| `"TRANSFER_START"` \| `"TRANSFER_CHUNK"` \| `"TRANSFER_COMPLETE"` \| `"TRANSFER_CANCEL"` | The v2 message type.         |
| `capability` | [`DevToolsCapability`](../type-aliases/DevToolsCapability.md)                                                                                                                                                                                                                        | The locally configured tier. |

## Returns

`boolean`

`true` when the tier is at least what the type requires.
