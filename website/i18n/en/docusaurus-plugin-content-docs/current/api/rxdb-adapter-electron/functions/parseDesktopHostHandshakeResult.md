# parseDesktopHostHandshakeResult()

```ts
function parseDesktopHostHandshakeResult(value): DesktopHostHandshakeResult;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:465

Validates a `handshake` response.

## Parameters

| Parameter | Type      | Description                                  |
| --------- | --------- | -------------------------------------------- |
| `value`   | `unknown` | The unvalidated payload returned by the host |

## Returns

[`DesktopHostHandshakeResult`](../interfaces/DesktopHostHandshakeResult.md)

The validated handshake result

## Remarks

This is the **only** validation point that runs before any request with side effects, so when it throws,
nothing has happened on the host yet: no database created, no connection opened, no session registered
(US-207 AC#9 / US-210 AC#10).

## Throws

throws `protocol_violation` when the shape is invalid or the protocol version does not match
