# HttpChangeFeedNotificationHook

```ts
type HttpChangeFeedNotificationHook = (report) => void;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:430](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L430)

Diagnostic callback: invoked when a parseable change notification is received (whether or not suppressed).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `report` | [`HttpChangeFeedNotificationReport`](../interfaces/HttpChangeFeedNotificationReport.md) |

## Returns

`void`

## Remarks

**Called synchronously, return value ignored, thrown errors discarded**, on the same basis as [HttpChangeFeedUnavailableHook](HttpChangeFeedUnavailableHook.md): a failing diagnostic port must never take down invalidation reporting.
