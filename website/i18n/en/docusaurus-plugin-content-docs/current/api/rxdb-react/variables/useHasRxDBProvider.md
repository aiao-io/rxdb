# useHasRxDBProvider

```ts
const useHasRxDBProvider: () => boolean = defaultProvider.useHasRxDBProvider;
```

Defined in: [rxdb-react/src/rxdb-react.tsx:407](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/rxdb-react.tsx#L407)

Whether there is a nearest [RxDBProvider](RxDBProvider.md) in the component tree.

## Returns

`boolean`

`true` when a Provider exists, regardless of whether the database is ready or the async source failed to create; `false` when there is none

## Remarks

Pair with [useRxDBOptional](useRxDBOptional.md) to tell apart its two kinds of `undefined`: "no Provider in the component tree at all" (this hook is `false`; the component runs as an independent form and should not wait for a database) versus "a Provider exists but the async source is still resolving or has failed" (this hook is `true`; render a loading state and intercept operations that depend on the database).

It only recognizes one set of contexts: a Provider created by [makeRxDBProvider](../functions/makeRxDBProvider.md) does not make it `true` — for that set, use its own returned `useHasRxDBProvider`.

## Example

```tsx
const database = useRxDBOptional();
const hasProvider = useHasRxDBProvider();
if (hasProvider && !database) return <Loading />; // Provider exists: wait for it to become ready (or show the creation failure)
return <Form database={database} />; // Ready, or no Provider — run as an independent form
```
