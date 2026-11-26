# isPageSize()

```ts
function isPageSize(value): value is number;
```

Defined in: [v2/guards.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/guards.ts#L50)

Checks whether a value is a valid `pageSize` (1–500).

## Parameters

| Parameter | Type      | Description         |
| --------- | --------- | ------------------- |
| `value`   | `unknown` | The value to check. |

## Returns

`value is number`

`true` when the value conforms.
