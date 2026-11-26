# HttpChangeFeedOpenHook

```ts
type HttpChangeFeedOpenHook = (report) => void;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:391](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L391)

**`Experimental`**

Diagnostic callback: invoked when the change-notification channel connects.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `report` | [`HttpChangeFeedOpenReport`](../interfaces/HttpChangeFeedOpenReport.md) |

## Returns

`void`

## Remarks

**Called synchronously, return value ignored, thrown errors discarded**, on the same basis as [HttpChangeFeedUnavailableHook](HttpChangeFeedUnavailableHook.md): a failing diagnostic port must never take down the channel. It is called only after this connection's bookkeeping (the start of the backoff criteria, the D7 full invalidation) is done; by the time it throws, all of that is already finished.

 Like [HttpAdapterOptions.changeFeed](../interfaces/HttpAdapterOptions.md#changefeed), outside the 1.0 compatibility promise.
