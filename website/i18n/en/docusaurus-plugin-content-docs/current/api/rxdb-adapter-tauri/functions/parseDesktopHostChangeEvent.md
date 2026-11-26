# parseDesktopHostChangeEvent()

```ts
function parseDesktopHostChangeEvent(value): SqliteChangeEvent;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:436

Validates a change event pushed by the host.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | Unvalidated event payload |

## Returns

[`SqliteChangeEvent`](../../rxdb-adapter-sqlite-core/interfaces/SqliteChangeEvent.md)

The change event that passed validation

## Remarks

The direction is the opposite of parseDesktopHostRequest, but the peer can no more be assumed to
behave here: when the renderer receives a malformed event it would rather throw than dispatch half
an event into the RxDB change pipeline, which would silently fork the local cache away from the
database's real state.

## Throws

Throws `protocol_violation` when the shape is invalid
