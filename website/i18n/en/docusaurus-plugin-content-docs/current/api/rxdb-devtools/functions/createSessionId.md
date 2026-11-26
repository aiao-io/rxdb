# createSessionId()

```ts
function createSessionId(): string;
```

Defined in: [v2/ids.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/ids.ts#L35)

Generates a canonical UUID v4 as the `sessionId`.

## Returns

`string`

A lowercase UUID of the form `xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx`.

## Remarks

**Deliberately does not use `crypto.randomUUID()`.** The connector runs inside the inspected page, and the DevTools extension explicitly accepts `http:` pages; on a LAN dev server such as `http://192.168.1.10:4200` the page is not a secure context, `crypto.randomUUID` is `undefined`, and the session would simply fail to be created in real usage.

Likewise, it **does not fall back to `Math.random()`**: the `sessionId` participates in the "reject all messages from an old session" check, and a predictable value would make rotation meaningless. If `getRandomValues` is unavailable, it throws rather than silently degrading.

## Throws

TypeError when the host does not provide `crypto.getRandomValues`.
