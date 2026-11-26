# FindByIdsHandler

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:137](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L137)

Protocol mapping for `findByIds`.

## Remarks

A chunk returning **fewer** rows than its id count is a **legal** result (the remote really deleted them); the adapter won't retry or backfill empty objects for that. When a row carries `updatedAt`, it must be an ISO 8601 string with a timezone (same basis as metadata).

## Methods

### parse() \{#parse\}

```ts
parse(body, ctx): unknown[];
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:141](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L141)

Parses the already-JSON-decoded response body

#### Parameters

| Parameter | Type                                      |
| --------- | ----------------------------------------- |
| `body`    | `unknown`                                 |
| `ctx`     | [`FindByIdsContext`](FindByIdsContext.md) |

#### Returns

`unknown`[]

---

### request() \{#request\}

```ts
request(ctx): HttpRequestSpec;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L139)

Produces the request description for this chunk. Pure function; no network

#### Parameters

| Parameter | Type                                      |
| --------- | ----------------------------------------- |
| `ctx`     | [`FindByIdsContext`](FindByIdsContext.md) |

#### Returns

[`HttpRequestSpec`](HttpRequestSpec.md)
