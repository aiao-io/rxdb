# MatchMedia

```ts
type MatchMedia = (query) => MediaQueryLike;
```

Defined in: [media.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/media.ts#L14)

A function that creates a `MediaQueryLike`; `window.matchMedia` satisfies it as-is.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `string` |

## Returns

[`MediaQueryLike`](../interfaces/MediaQueryLike.md)
