# HttpMethod

```ts
type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L23)

The HTTP methods a handler may produce.

## Remarks

`HEAD` is included for the `isTableExisted` probe: the verdict looks only at the status code, and fetching the response body would waste bandwidth.
