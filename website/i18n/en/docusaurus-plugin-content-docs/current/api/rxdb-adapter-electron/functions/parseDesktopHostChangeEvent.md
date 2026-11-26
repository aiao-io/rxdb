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

The validated change event

## Remarks

The direction is the opposite of parseDesktopHostRequest's, but the peer still cannot be assumed to play by the rules:
when the renderer receives a malformed event, it prefers to throw rather than dispatch half an event into the RxDB
change pipeline, which would silently fork the local cache from the database's true state.

## Throws

throws `protocol_violation` when the shape is invalid
