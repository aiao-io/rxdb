# tabKeyOf()

```ts
function tabKeyOf(url): string;
```

Defined in: [tabs/tabs-ops.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-ops.ts#L42)

Normalizes a URL into a tab key: strips the query string, hash, and trailing slash (except for the root path).

## Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `url`     | `string` | The URL.    |

## Returns

`string`

The tab key.
