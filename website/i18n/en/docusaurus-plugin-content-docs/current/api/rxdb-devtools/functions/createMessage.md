# createMessage()

```ts
function createMessage<T>(type, direction, payload, sequence): MessageOfType<T>;
```

Defined in: [types.ts:730](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L730)

Creates an RxDB DevTools message.

## Type Parameters

| Type Parameter                                                                              |
| ------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`MessageType`](../type-aliases/MessageType.md) |

## Parameters

| Parameter   | Type                                                                            | Description                                                                                         |
| ----------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `type`      | `T`                                                                             | The message type; it also determines the legal values of `direction` and `payload`.                 |
| `direction` | [`MessageOfType`](../type-aliases/MessageOfType.md)&lt;`T`&gt;\[`"direction"`\] | The direction allowed for this type.                                                                |
| `payload`   | [`MessageOfType`](../type-aliases/MessageOfType.md)&lt;`T`&gt;\[`"payload"`\]   | The payload defined by this type.                                                                   |
| `sequence`  | `number`                                                                        | A monotonically increasing sequence number within the session; must be a non-negative safe integer. |

## Returns

[`MessageOfType`](../type-aliases/MessageOfType.md)&lt;`T`&gt;

A message object exactly corresponding to `type`.

## Throws

RangeError when `sequence` is not a non-negative safe integer.

## Remarks

The only source of truth on the outbound side is [AnyDevToolsMessage](../type-aliases/AnyDevToolsMessage.md): the factory derives `direction`/`payload` from `type`, and **this package's own [isDevToolsMessage](isDevToolsMessage.md) accepts any output of this factory**. Previously the four parameters were independent of each other, and `createMessage('DELETE_BRANCH', 'page-to-devtools', 123, -1)` would compile but be judged illegal by its own guard.

`sequence` cannot rule out negative numbers at the type level, so it fails fast at runtime — letting it flow out would only turn it into a message silently dropped by the receiving side, with the symptom and the cause impossible to correlate.
