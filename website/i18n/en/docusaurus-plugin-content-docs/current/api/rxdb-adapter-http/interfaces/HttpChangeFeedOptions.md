# HttpChangeFeedOptions

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:444](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L444)

Configuration for the change-notification channel (SSE) (US-023 D5).

## Remarks

**All fields are collected in this object**, not flattened onto [HttpAdapterOptions](HttpAdapterOptions.md): outside `changeFeed` they are meaningless, and flattening would make a dead config like "`onChangeFeedUnavailable` configured but `changeFeed` not" type-legal and never firing.

**Authentication can't go through the `auth` hook.** `EventSource` can't send custom headers — that's its spec, not this package's choice. So the notification endpoint can only rely on cookies (via [HttpChangeFeedOptions.withCredentials](#withcredentials)) or credentials baked into the `url`. The adapter's `auth` hook **does not apply** to this connection.

## Properties

### onNotification? \{#onnotification\}

```ts
onNotification?: HttpChangeFeedNotificationHook;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:490](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L490)

Diagnostic callback when a parseable notification is received (including suppressed self-echoes).

#### Remarks

Symmetric with [HttpChangeFeedOptions.onUnavailable](#onunavailable): one reports "the channel is gone", the other "the channel delivered". Without it, channel behavior is completely unchanged. For the rationale see [HttpChangeFeedNotificationReport](HttpChangeFeedNotificationReport.md).

***

### onOpen? \{#onopen\}

```ts
onOpen?: HttpChangeFeedOpenHook;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:474](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L474)

**`Experimental`**

Diagnostic callback when the channel connects.

#### Remarks

Symmetric with [HttpChangeFeedOptions.onUnavailable](#onunavailable): one reports "the channel is up", the other "the channel is gone"; only the two together answer "is it connected right now" — `RxDBAdapterHttp.changeFeedEnabled` only answers "should it run".

Trigger semantics:

- **Fires once per `open` event dispatched by `EventSource`**: first connection, reconnects after this package's backoff takes over, and the browser's native reconnects are all treated the same, at the same moment as "connection success = full invalidation" (D7). `connect()` / `startChangeFeed()` themselves don't fire it — they only initiate the connection.
- **Fires after this connection's full invalidation**: by the time the callback runs, every subscribed entity's invalidation has already been handed to core.
- **It says "connected right now", not "this connection is stable"**: if the backend closes immediately after accepting, this callback and `onUnavailable` will alternate; the backoff counter still only resets once a connection survives one backoff period, not on connect.
- A late `open` arriving after `stopChangeFeed()` / `disconnect()` does not fire.

Without it, channel behavior is completely unchanged. Thrown errors are discarded; for the rationale see [HttpChangeFeedOpenHook](../type-aliases/HttpChangeFeedOpenHook.md).

 Like [HttpAdapterOptions.changeFeed](HttpAdapterOptions.md#changefeed), outside the 1.0 compatibility promise.

***

### onUnavailable? \{#onunavailable\}

```ts
onUnavailable?: HttpChangeFeedUnavailableHook;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:482](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L482)

Diagnostic callback when the channel becomes unavailable.

#### Remarks

Without it, channel behavior is completely unchanged (backoff and reconnect as usual) — it just has no mouth. And since D5 explicitly forbids polling degradation, this callback is the only outlet for "can't connect". Thrown errors are discarded; for the rationale see [HttpChangeFeedUnavailableHook](../type-aliases/HttpChangeFeedUnavailableHook.md).

***

### reconnectBaseDelayMs? \{#reconnectbasedelayms\}

```ts
reconnectBaseDelayMs?: number;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:450](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L450)

Starting delay for backoff reconnects (milliseconds). Default `1000`; must be a finite positive integer

***

### reconnectMaxDelayMs? \{#reconnectmaxdelayms\}

```ts
reconnectMaxDelayMs?: number;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:452](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L452)

Delay cap for backoff reconnects (milliseconds). Default `30000`; must be a finite positive integer and no smaller than the starting delay

***

### url \{#url\}

```ts
url: string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:446](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L446)

The SSE endpoint: an absolute URL, or a path relative to `baseUrl`

***

### withCredentials? \{#withcredentials\}

```ts
withCredentials?: boolean;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:448](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L448)

Whether cross-origin connections carry cookies, passed through to `EventSource`. Default `false`
