# isDevToolsProviderDescriptor()

```ts
function isDevToolsProviderDescriptor(value): value is DevToolsProviderDescriptor;
```

Defined in: [provider/descriptor.ts:163](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/descriptor.ts#L163)

Checks whether a value is a legal provider descriptor.

## Parameters

| Parameter | Type      | Description         |
| --------- | --------- | ------------------- |
| `value`   | `unknown` | The value to check. |

## Returns

`value is DevToolsProviderDescriptor`

`true` when exact-key, kind matches the domain, operations are ordered with no duplicates, and limits are self-consistent.
