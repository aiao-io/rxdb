# resolveMessage()

```ts
function resolveMessage(
   messages, 
   locales, 
   namespace, 
   key
): ResolvedMessage;
```

Defined in: [catalog.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/catalog.ts#L55)

Looks up a message along the locale chain; layer priority within one locale is decided by the caller's merged rows.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `messages` | readonly [`CatalogMessage`](../interfaces/CatalogMessage.md)[] |
| `locales` | readonly `string`[] |
| `namespace` | `string` |
| `key` | `string` |

## Returns

[`ResolvedMessage`](../interfaces/ResolvedMessage.md)