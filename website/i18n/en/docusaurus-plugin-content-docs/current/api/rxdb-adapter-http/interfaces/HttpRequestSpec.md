# HttpRequestSpec

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L31)

The request description a handler produces and **the adapter executes**.

## Remarks

Auth headers are layered on by the adapter; don't put them here.

## Properties

### body? \{#body\}

```ts
body?: unknown;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L36)

The adapter handles JSON serialization

***

### headers? \{#headers\}

```ts
headers?: Record<string, string>;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L45)

Additional headers; on conflict with the auth hook, **the auth hook wins**.

#### Remarks

When [HttpAdapterOptions.conditionalRequests](HttpAdapterOptions.md#conditionalrequests) is on, this group **participates in the request fingerprint**: splitting projections by tenant / language on the same URL is safe, and each projection gets its own cache entry. Of the three header groups, only this one enters the fingerprint; for the trade-offs on the other two, see `conditionalRequests`.

***

### method \{#method\}

```ts
method: HttpMethod;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L34)

***

### url \{#url\}

```ts
url: string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L33)

An absolute URL, or a path relative to `baseUrl`
