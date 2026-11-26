# createDevToolsV2Message()

```ts
function createDevToolsV2Message<TType>(type, payload, options): DevToolsV2Envelope<TType>;
```

Defined in: [v2/wire.ts:431](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L431)

Constructs a v2 message.

## Type Parameters

| Type Parameter                                                                                                                                                                                                                                                                                                                           | Description       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| <a id="type-parameter-ttype"></a> `TType` _extends_ \| `"HANDSHAKE"` \| `"HANDSHAKE_ACK"` \| `"EVENT"` \| `"DISCONNECT"` \| `"PING"` \| `"PROTOCOL_HELLO"` \| `"PONG"` \| `"CLEAR_EVENT_BUFFER"` \| `"REQUEST"` \| `"RESPONSE"` \| `"ERROR"` \| `"TRANSFER_START"` \| `"TRANSFER_CHUNK"` \| `"TRANSFER_COMPLETE"` \| `"TRANSFER_CANCEL"` | The message type. |

## Parameters

| Parameter | Type                                                                       | Description                                                                             |
| --------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `type`    | `TType`                                                                    | The message type.                                                                       |
| `payload` | [`DevToolsV2PayloadMap`](../interfaces/DevToolsV2PayloadMap.md)\[`TType`\] | The payload matching the type.                                                          |
| `options` | [`DevToolsV2MessageOptions`](../interfaces/DevToolsV2MessageOptions.md)    | The session, sequence number, timestamp and (for bidirectional messages) the direction. |

## Returns

[`DevToolsV2Envelope`](../interfaces/DevToolsV2Envelope.md)&lt;`TType`&gt;

A self-consistent v2 message that necessarily passes [isDevToolsV2Message](isDevToolsV2Message.md).

## Remarks

The direction is derived from the type instead of being filled in freely by the caller, so that ownership constraints like "only the panel may produce ACKs" hold on the sending side rather than being discovered on the receiving side.

## Throws

TypeError when a bidirectional message lacks a direction, or a unidirectional message is given a conflicting one.
