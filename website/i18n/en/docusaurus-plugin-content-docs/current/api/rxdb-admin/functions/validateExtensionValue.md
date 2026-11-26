# validateExtensionValue()

```ts
function validateExtensionValue(extension, value): boolean;
```

Defined in: [preferences/schema/extension.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/extension.ts#L12)

Validates whether an extension value matches its declaration.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `extension` | [`PreferenceExtension`](../interfaces/PreferenceExtension.md) | The extension declaration. |
| `value` | `unknown` | The value to validate. |

## Returns

`boolean`

Returns `true` when valid.
