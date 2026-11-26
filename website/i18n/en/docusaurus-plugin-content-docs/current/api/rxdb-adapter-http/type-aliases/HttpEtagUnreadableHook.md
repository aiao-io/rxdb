# HttpEtagUnreadableHook

```ts
type HttpEtagUnreadableHook = (report) => void;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:314](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L314)

Diagnostic callback: invoked when conditional requests are on but no `ETag` can be read.

## Parameters

| Parameter | Type                                                                    |
| --------- | ----------------------------------------------------------------------- |
| `report`  | [`HttpEtagUnreadableReport`](../interfaces/HttpEtagUnreadableReport.md) |

## Returns

`void`

## Remarks

**Called synchronously, return value ignored, thrown errors discarded** (see `HttpAdapterOptions.onEtagUnreadable`). Implementations that want asynchronous reporting must `catch` themselves: this callback is the package's only output channel, and when it fails there is no second channel to report that failure.
