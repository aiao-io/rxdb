# shouldIgnoreSqliteMessage()

```ts
function shouldIgnoreSqliteMessage(args): boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L39)

Determines whether SQLite output is known ignorable noise (such as the OPFS main-thread fallback notice).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `args` | `unknown`[] | Arbitrary console-style argument list |

## Returns

`boolean`

True when a predefined pattern is matched
