# HttpAuthHook

```ts
type HttpAuthHook = () => 
  | Record<string, string>
  | Promise<Record<string, string>>;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:257](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L257)

auth hook: injects token / headers.

## Returns

  \| `Record`&lt;`string`, `string`&gt;
  \| `Promise`&lt;`Record`&lt;`string`, `string`&gt;&gt;

## Remarks

Called by the adapter **before a request goes out**, so "if the hook throws, the request is not sent" is something this package can guarantee (AC#16). No OAuth flow is built in.
