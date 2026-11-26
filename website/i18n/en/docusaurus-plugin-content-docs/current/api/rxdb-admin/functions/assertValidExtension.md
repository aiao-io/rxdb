# assertValidExtension()

```ts
function assertValidExtension(extension): void;
```

Defined in: [preferences/schema/extension.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/extension.ts#L39)

Validates the extension declaration itself; called on registration and throws immediately when invalid.

## Parameters

| Parameter   | Type                                                          | Description                |
| ----------- | ------------------------------------------------------------- | -------------------------- |
| `extension` | [`PreferenceExtension`](../interfaces/PreferenceExtension.md) | The extension declaration. |

## Returns

`void`

## Throws

When the key is invalid, a `select` has no options, a `number` range is inverted, or the default value does not match the declaration.
