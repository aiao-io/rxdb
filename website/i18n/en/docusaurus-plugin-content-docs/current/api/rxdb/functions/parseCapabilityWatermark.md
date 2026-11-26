# parseCapabilityWatermark()

```ts
function parseCapabilityWatermark(name): 
  | RxDBCapabilityClaim
  | undefined;
```

Defined in: [packages/rxdb/src/system/capability-watermark.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/capability-watermark.ts#L90)

Reads a capability claim back out of a migration row name.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | `string` | One row of `rxdb_migration."name"` |

## Returns

  \| [`RxDBCapabilityClaim`](../interfaces/RxDBCapabilityClaim.md)
  \| `undefined`

`undefined` when there is no capability prefix

## Throws

[MalformedRxDBCapabilityWatermarkError](../classes/MalformedRxDBCapabilityWatermarkError.md) when the prefix is present but the three segments cannot be read

## Remarks

Only the first two `:` are split; the third segment is kept whole — package specifiers legitimately contain `:` (`https://host:8443/x`,
`npm:@scope/name` are both valid), and over-splitting would make it impossible to report the name that could rescue the library.

When the prefix is present but unreadable, **throw rather than return `undefined`**: the latter would downgrade "a new format written by a newer version" into
"unrecognized, skip" — and skipping is the only failure mode this guard exists to prevent.
