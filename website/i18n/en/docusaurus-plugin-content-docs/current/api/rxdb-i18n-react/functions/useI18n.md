# useI18n()

```ts
function useI18n(runtime?): I18nBinding;
```

Defined in: [rxdb-i18n-react/src/use-i18n.tsx:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n-react/src/use-i18n.tsx#L76)

Subscribes to the current i18n runtime; the subscription is cleaned up on unmount.

## Parameters

| Parameter  | Type                                      | Description                                                        |
| ---------- | ----------------------------------------- | ------------------------------------------------------------------ |
| `runtime?` | [`I18n`](../../rxdb-i18n/classes/I18n.md) | An optional explicit runtime, taking precedence over the provider. |

## Returns

[`I18nBinding`](../interfaces/I18nBinding.md)

The current language, translation and formatting functions.

## Throws

Throws when no provider exists and no runtime was passed.
