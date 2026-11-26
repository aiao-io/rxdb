# HttpEtagUnreadableReport

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:281](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L281)

The **fact** at the moment "conditional requests are on, yet no `ETag` can be read" (US-215).

## Remarks

All fields are observations, no conclusions: the client **cannot tell apart** the two causes of an unreadable `ETag` — the remote never sent one, or it did but the cross-origin response didn't list it in `Access-Control-Expose-Headers` — the two completely overlap on `response.headers.get('etag') === null`. Guessing one for the caller would, in the half of cases where the guess is wrong, send them to change a server that was already correct.

## Properties

### entityName? \{#entityname\}

```ts
entityName?: string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:291](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L291)

The entity name.

#### Remarks

Optional only because transport's `sendJson` shares one signature across all operations, and operations like `version` have no entity. **The two operations that actually trigger this callback are both entity-driven, so this is always set in practice.**

---

### message \{#message\}

```ts
message: string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:303](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L303)

A ready-made explanation message: mentions both causes without taking sides

---

### operation \{#operation\}

```ts
operation: string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:283](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L283)

The name of the triggering operation; only `fetchMetadata` / `findByIds` participate in the conditional cache

---

### responseType \{#responsetype\}

```ts
responseType: HttpResponseType;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:301](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L301)

Passed through as-is from `Response.type`, **no verdict drawn**.

#### Remarks

In browsers, cross-origin responses are `'cors'` and same-origin ones `'basic'`, which can serve as a clue. Under Node (undici) a hand-constructed `Response` is always `'default'`, so this is a **clue, not a verdict** — the judgment belongs to callers who can see the deployment topology.

---

### url \{#url\}

```ts
url: string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:293](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L293)

The absolute URL the request was sent to
