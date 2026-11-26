# HttpChangeFeedUnavailableHook

```ts
type HttpChangeFeedUnavailableHook = (report) => void;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:361](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L361)

Diagnostic callback: invoked when the change-notification channel becomes unavailable.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `report` | [`HttpChangeFeedUnavailableReport`](../interfaces/HttpChangeFeedUnavailableReport.md) |

## Returns

`void`

## Remarks

**Called synchronously, return value ignored, thrown errors discarded**, on the same basis as [HttpEtagUnreadableHook](HttpEtagUnreadableHook.md).
