# isDevToolsProviderDescriptorSet()

```ts
function isDevToolsProviderDescriptorSet(value): value is readonly DevToolsProviderDescriptor[];
```

Defined in: [provider/descriptor.ts:189](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/descriptor.ts#L189)

Checks whether a value is a valid descriptor set: at most one per domain.

## Parameters

| Parameter | Type      | Description         |
| --------- | --------- | ------------------- |
| `value`   | `unknown` | The value to check. |

## Returns

`value is readonly DevToolsProviderDescriptor[]`

`true` when every entry is valid and no domain repeats.

## Remarks

An absent domain is a legal wire shape — requests for that domain get a structured `provider_unsupported`. A duplicated domain must be rejected here: two descriptors for the same domain would make "which one decides permissions" order-dependent.
