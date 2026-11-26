# satisfiesCapability()

```ts
function satisfiesCapability(actual, required): boolean;
```

Defined in: [v2/capability.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/capability.ts#L49)

Checks whether the actual tier reaches the required tier.

## Parameters

| Parameter  | Type                                                          | Description                                        |
| ---------- | ------------------------------------------------------------- | -------------------------------------------------- |
| `actual`   | [`DevToolsCapability`](../type-aliases/DevToolsCapability.md) | The actual tier configured by the connector owner. |
| `required` | [`DevToolsCapability`](../type-aliases/DevToolsCapability.md) | The minimum tier required by the operation.        |

## Returns

`boolean`

`true` when the actual tier meets or exceeds the required one.
