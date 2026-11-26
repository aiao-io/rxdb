# capabilityWatermarkName()

```ts
function capabilityWatermarkName(claim): string;
```

Defined in: [packages/rxdb/src/system/capability-watermark.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/capability-watermark.ts#L72)

Encodes a capability claim into a migration row name.

## Parameters

| Parameter | Type                                                          | Description                                   |
| --------- | ------------------------------------------------------------- | --------------------------------------------- |
| `claim`   | [`RxDBCapabilityClaim`](../interfaces/RxDBCapabilityClaim.md) | The capability, version and package specifier |

## Returns

`string`

The row name of `rxdb_migration."name"`
