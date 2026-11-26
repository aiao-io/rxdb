# parseDesktopHostOpenResult()

```ts
function parseDesktopHostOpenResult(value): DesktopHostOpenResult;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:481

Validates an `open` response.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The unvalidated payload returned by the host |

## Returns

[`DesktopHostOpenResult`](../interfaces/DesktopHostOpenResult.md)

The validated open result

## Throws

throws `protocol_violation` when the shape is invalid or the protocol version does not match
