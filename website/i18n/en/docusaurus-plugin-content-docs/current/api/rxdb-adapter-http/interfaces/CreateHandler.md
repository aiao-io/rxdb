# CreateHandler

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:176](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L176)

Protocol mapping for `create`.

## Methods

### parse() \{#parse\}

```ts
parse(body, ctx): unknown;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:188](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L188)

Parses the response body into the full entity **after the write** (the remote may have added id / updatedAt).

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `body`    | `unknown`                           |
| `ctx`     | [`CreateContext`](CreateContext.md) |

#### Returns

`unknown`

#### Remarks

Must parse the remote's receipt and **must not echo the input**: the receipt is what actually landed in storage; echoing would leave a local row that never exists on the remote. Timestamps are always finalized by the remote; the id, however, may be the one the client gave — rows created offline queue up with their local id, the remote adopts it, and only then does the local copy match the remote.

When the receipt carries `updatedAt`, it must be an ISO 8601 string with a timezone; the adapter normalizes it before handing it to core (same basis as metadata).

---

### request() \{#request\}

```ts
request(ctx): HttpRequestSpec;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:177](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L177)

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `ctx`     | [`CreateContext`](CreateContext.md) |

#### Returns

[`HttpRequestSpec`](HttpRequestSpec.md)
