# DeleteHandler

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:204](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L204)

Protocol mapping for `delete`.

## Remarks

No `parse`: core's duck returns `Observable<void>`, and the response body has nowhere to go.

## Methods

### request() \{#request\}

```ts
request(ctx): HttpRequestSpec;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:205](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L205)

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `ctx`     | [`DeleteContext`](DeleteContext.md) |

#### Returns

[`HttpRequestSpec`](HttpRequestSpec.md)
