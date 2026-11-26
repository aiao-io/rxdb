# useI18nOptional()

```ts
function useI18nOptional(): I18nBinding | undefined;
```

Defined in: [rxdb-i18n-react/src/use-i18n.tsx:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n-react/src/use-i18n.tsx#L87)

Subscribes to an optional provider; no subscription is created when missing.

## Returns

[`I18nBinding`](../interfaces/I18nBinding.md) \| `undefined`

The i18n binding; `undefined` when no provider exists.
