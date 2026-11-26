# HttpChangeFeedUnavailableReport

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:325](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L325)

The **fact** at the moment the change-notification channel becomes unavailable (US-023 AC#17).

## Remarks

Same precedent as [HttpEtagUnreadableReport](HttpEtagUnreadableReport.md): all fields are observations, no conclusions. In particular, **why the connection failed cannot be read out** — `EventSource`'s `error` event carries no status code and no response body; "endpoint not implemented (404)", "auth expired (401)" and "network down" completely overlap on it. Guessing one for the caller would send them to fix something that was never broken.

## Properties

### attempt \{#attempt\}

```ts
attempt: number;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:338](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L338)

Number of failures since the last successful connection; always `0` for `unsupported-runtime`

---

### data? \{#data\}

```ts
data?: string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:350](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L350)

The raw `data` text for `malformed-message`; `undefined` otherwise

---

### message \{#message\}

```ts
message: string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:352](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L352)

A ready-made explanation message

---

### readyState? \{#readystate\}

```ts
readyState?: number;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:346](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L346)

Passed through as-is from `EventSource.readyState` at failure time, **no verdict drawn**.

#### Remarks

`0` (CONNECTING) means the browser is reconnecting on its own and this package stays out of it; `2` (CLOSED) means the browser gave up and this package's backoff takes over the reconnection. When the constructor throws outright there is no instance to read, hence `undefined`.

---

### reason \{#reason\}

```ts
reason: 'unsupported-runtime' | 'connection-error' | 'malformed-message';
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:336](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L336)

Which kind of fact was observed.

- `unsupported-runtime`: the current runtime has no `EventSource` (e.g. Node). **Will not reconnect** — no number of retries can conjure a global constructor.
- `connection-error`: the connection failed to establish or dropped mid-way.
- `malformed-message`: the connection is fine, but this one message yields no parseable entity name.

---

### retryInMs? \{#retryinms\}

```ts
retryInMs?: number;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:348](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L348)

The next reconnect delay this package has scheduled (milliseconds); `undefined` when this package won't reconnect this time

---

### url \{#url\}

```ts
url: string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:327](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L327)

Absolute URL of the notification endpoint
