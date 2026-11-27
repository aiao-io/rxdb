# isCrossTabEvent()

```ts
function isCrossTabEvent(event): boolean;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:730](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L730)

Determines whether an event comes from another tab.

## Parameters

| Parameter | Type                                        | Description        |
| --------- | ------------------------------------------- | ------------------ |
| `event`   | [`RxDBEvent`](../type-aliases/RxDBEvent.md) | The event to judge |

## Returns

`boolean`

`true` when the event carries entities marked with `origin: 'cross-tab'`

## Remarks

The marker is written onto the entity by the gateway's `#markEventAsCrossTab` and travels with the event object through the host's transaction queue —
while `#processingRemoteEvent` inside the gateway is only a flag for the instant of dispatch. Remote events received during a transaction wait
until COMMIT to replay listeners, by which time the flag has long been reset — **the marker on the event itself is the only clue to the source**.

Two consumers:

- The gateway: cross-tab events are not re-broadcast, preventing echo loops;
- [RxDB](../classes/RxDB.md)'s transaction rollback: only local events are dropped; changes already committed by other tabs are dispatched as usual.
