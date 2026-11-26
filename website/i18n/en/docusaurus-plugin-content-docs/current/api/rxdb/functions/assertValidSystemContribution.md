# assertValidSystemContribution()

```ts
function assertValidSystemContribution(contribution, pluginName): void;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:439](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L439)

Validates the shape of a contribution.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `contribution` | [`RxDBSystemContribution`](../interfaces/RxDBSystemContribution.md) | The contribution to be registered |
| `pluginName` | `string` | The plugin name used for attribution in errors |

## Returns

`void`

## Throws

Error when the capability name is empty or contains `:`, or the version is not a positive integer, or the package specifier is empty

## Remarks

None of these three can be blocked by the type system: `Uncapitalize<string>` allows both the empty string and `:`, and `number` allows `1.5`
and `NaN`. And all of them only surface when the **watermark row is read back** — usually on another machine, in another process,
far away from the line of code that went wrong. Breaking at registration time makes the error point back to the place that should be fixed.
