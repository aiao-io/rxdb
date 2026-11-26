# createAdminI18n()

```ts
function createAdminI18n(locale?): I18n;
```

Defined in: [i18n/index.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/i18n/index.ts#L21)

Creates a static runtime carrying only the shell catalog, Chinese by default; used when the application has no `I18n` of its own.

## Parameters

| Parameter | Type     | Default value | Description                                |
| --------- | -------- | ------------- | ------------------------------------------ |
| `locale?` | `string` | `'zh-Hans'`   | The initial locale; defaults to `zh-Hans`. |

## Returns

[`I18n`](../../rxdb-i18n/classes/I18n.md)

The runtime.
