# queryParse()

```ts
function queryParse(query): Record<string, QueryValue>;
```

Defined in: [packages/utils/src/string/queryParse.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/string/queryParse.ts#L12)

Parses a query string; duplicate keys are aggregated into string arrays

The returned object has a `null` prototype, so query keys like `__proto__` / `constructor` / `toString` are just ordinary data keys — they are neither shadowed by same-named properties on the prototype chain nor able to tamper with the prototype.

## Parameters

| Parameter | Type     | Description      |
| --------- | -------- | ---------------- |
| `query`   | `string` | The query string |

## Returns

`Record`&lt;`string`, `QueryValue`&gt;

The query parameter object (with `null` prototype)
