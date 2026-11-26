# isMutatingOperation()

```ts
function isMutatingOperation(domain, operation): boolean;
```

Defined in: [v2/authorization.ts:158](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/authorization.ts#L158)

Checks whether an operation changes persistent state.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `domain` | `"database"` \| `"files"` \| `"settings"` | The provider domain. |
| `operation` | `string` | The operation name. |

## Returns

`boolean`

`true` when the operation requires the `full` tier; unregistered operations return `false`.
