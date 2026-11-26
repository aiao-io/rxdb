# HttpResponseType

```ts
type HttpResponseType = 'basic' | 'cors' | 'default' | 'error' | 'opaque' | 'opaqueredirect';
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:270](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L270)

The set of values of `Response.type`.

## Remarks

Character-for-character synonymous with DOM's `ResponseType`, but **declared on our own**: the DOM one is a global name that only exists when `lib` includes `dom`. Once written into a public interface, pure-Node consumers (`lib: ["es2025"]`) compiling our `.d.ts` would fail with `TS2304: Cannot find name 'ResponseType'` — and this repo's base tsconfig includes `dom`, so we'd never see that red ourselves. The guard lives in `__tests__/public-types.spec.ts`.

Not imported from `undici-types`: that's a Node-side **module** export which browser consumers don't have.
