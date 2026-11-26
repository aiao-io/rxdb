# isDevToolsProviderDomain()

```ts
function isDevToolsProviderDomain(value): value is "database" | "files" | "settings";
```

Defined in: [provider/descriptor.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/descriptor.ts#L110)

Checks whether a value is a known provider domain.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value to check. |

## Returns

value is "database" \| "files" \| "settings"

`true` when the value is one of the three domains.
