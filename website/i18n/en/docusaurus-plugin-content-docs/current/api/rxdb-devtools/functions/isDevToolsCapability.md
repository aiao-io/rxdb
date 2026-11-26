# isDevToolsCapability()

```ts
function isDevToolsCapability(value): value is DevToolsCapability;
```

Defined in: [v2/capability.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/capability.ts#L38)

Checks whether a value is a valid capability tier.

## Parameters

| Parameter | Type      | Description         |
| --------- | --------- | ------------------- |
| `value`   | `unknown` | The value to check. |

## Returns

`value is DevToolsCapability`

`true` when the value is one of the three known tiers.
