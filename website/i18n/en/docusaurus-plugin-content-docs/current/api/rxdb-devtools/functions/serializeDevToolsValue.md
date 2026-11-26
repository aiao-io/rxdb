# serializeDevToolsValue()

```ts
function serializeDevToolsValue(value): unknown;
```

Defined in: [serializer.ts:215](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/serializer.ts#L215)

Converts a runtime value into a JSON-safe DevTools wire value detached from the original object.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | A runtime value exposed as read-only diagnostic information. |

## Returns

`unknown`

JSON-safe data; bigint and binary leaf nodes use versioned envelopes.
