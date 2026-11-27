# catalogMessages()

```ts
function catalogMessages(catalog): CatalogMessage[];
```

Defined in: [catalog.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/catalog.ts#L44)

Returns rows only after fully validating the catalog, so callers can merge them atomically.

## Parameters

| Parameter | Type                                                |
| --------- | --------------------------------------------------- |
| `catalog` | [`MessageCatalog`](../interfaces/MessageCatalog.md) |

## Returns

[`CatalogMessage`](../interfaces/CatalogMessage.md)[]
