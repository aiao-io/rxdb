# recordVisit()

```ts
function recordVisit(history, key): string[];
```

Defined in: [tabs/tabs-ops.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-ops.ts#L60)

Records a visit: most recent first, deduplicated and length-limited.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `history` | readonly `string`[] | The current history. |
| `key` | `string` | The key of the visited tab. |

## Returns

`string`[]

The new history.
