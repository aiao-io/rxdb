# formatMetadataViolations()

```ts
function formatMetadataViolations(errors): string;
```

Defined in: [packages/rxdb/src/entity/metadata-validate.ts:799](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata-validate.ts#L799)

Renders the violations aggregated across entities into a single exception message.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `errors` | readonly [`EntityMetadataValidationError`](../interfaces/EntityMetadataValidationError.md)[] | The list of aggregated violations |

## Returns

`string`
