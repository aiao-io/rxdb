# createMediaQueryStore()

```ts
function createMediaQueryStore(matchMedia, query): object;
```

Defined in: [media.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/media.ts#L22)

Turns a media query's match state into a reactive store.

## Parameters

| Parameter    | Type                                                         | Description                                                        |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `matchMedia` | [`MatchMedia`](../type-aliases/MatchMedia.md) \| `undefined` | The host's `matchMedia`; always `false` when absent (SSR / tests). |
| `query`      | `string`                                                     | The media query.                                                   |

## Returns

`object`

A read-only store and a stop-listening function.

### stop

```ts
stop: () => void;
```

#### Returns

`void`

### store

```ts
store: ReadableStore<boolean>;
```
