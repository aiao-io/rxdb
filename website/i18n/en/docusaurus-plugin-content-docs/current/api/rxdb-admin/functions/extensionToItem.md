# extensionToItem()

```ts
function extensionToItem(extension): PreferenceItem;
```

Defined in: [preferences/schema/extension.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/extension.ts#L59)

Converts an extension declaration into a preference item, rendered on the "Extensions" tab.

## Parameters

| Parameter   | Type                                                          | Description                |
| ----------- | ------------------------------------------------------------- | -------------------------- |
| `extension` | [`PreferenceExtension`](../interfaces/PreferenceExtension.md) | The extension declaration. |

## Returns

[`PreferenceItem`](../interfaces/PreferenceItem.md)

The preference item.
