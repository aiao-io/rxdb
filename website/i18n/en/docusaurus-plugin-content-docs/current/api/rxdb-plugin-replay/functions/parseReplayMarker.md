# parseReplayMarker()

```ts
function parseReplayMarker(event): ReplayMarker | null;
```

Defined in: [packages/rxdb-plugin-replay/src/markers.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/markers.ts#L65)

Parses an rrweb event into a marker of this plugin.

## Parameters

| Parameter | Type            |
| --------- | --------------- |
| `event`   | `eventWithTime` |

## Returns

[`ReplayMarker`](../type-aliases/ReplayMarker.md) \| `null`

Not a Custom event, or the tag is not one of this plugin's three tags → `null`

## Throws

[RxDBReplayError](../classes/RxDBReplayError.md) `invalid_marker`: the tag is one of this plugin's, but the payload shape is wrong
