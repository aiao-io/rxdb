# HttpChangeFeedOpenReport

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:376](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L376)

**`Experimental`**

The fact at the moment the change-notification channel **connects**.

## Remarks

Pairs with [HttpChangeFeedUnavailableReport](HttpChangeFeedUnavailableReport.md): one reports "the channel is gone", the other "the channel is up". Without this half, judging connection liveness outside the package leaves only the enable intent (`RxDBAdapterHttp.changeFeedEnabled`, which stays `true` even with the cable pulled) and failure reports — and failure reports have no follow-up after a successful reconnect, so treating "a failure was reported" as "currently disconnected" would keep showing disconnected even after recovery.

The only field is the URL: "connected" is itself the entire fact, and `EventSource`'s `open` event carries nothing else.

Like [HttpAdapterOptions.changeFeed](HttpAdapterOptions.md#changefeed), outside the 1.0 compatibility promise.

## Properties

### url \{#url\}

```ts
url: string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:378](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L378)

**`Experimental`**

Absolute URL of the notification endpoint
