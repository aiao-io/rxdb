# IsTableExistedHandler

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:223](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L223)

Protocol mapping for `isTableExisted()`.

## Remarks

Only needs to produce the probe request: the verdict is made entirely by the adapter from the HTTP status code (2xx → `true`, 404 → `false`, anything else and transport failures → throw). **The handler never sees the status**, which is why there's no `parse` here — "unknown" and "does not exist" must stay distinct, and only the transport layer can see the status code.

## Methods

### request() \{#request\}

```ts
request(ctx): HttpRequestSpec;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:224](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L224)

#### Parameters

| Parameter        | Type                          |
| ---------------- | ----------------------------- |
| `ctx`            | \{ `entityName`: `string`; \} |
| `ctx.entityName` | `string`                      |

#### Returns

[`HttpRequestSpec`](HttpRequestSpec.md)
