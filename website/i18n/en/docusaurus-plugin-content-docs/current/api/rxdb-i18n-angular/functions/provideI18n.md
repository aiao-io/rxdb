# provideI18n()

```ts
function provideI18n(runtime): Provider;
```

Defined in: [rxdb-i18n-angular/src/use-i18n.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n-angular/src/use-i18n.ts#L24)

Provides the runtime in the current injector; destruction is the caller's responsibility.

## Parameters

| Parameter | Type                                                                                              | Description                                                       |
| --------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `runtime` | \| [`I18n`](../../rxdb-i18n/classes/I18n.md) \| (() => [`I18n`](../../rxdb-i18n/classes/I18n.md)) | An already created runtime or a synchronous construction factory. |

## Returns

`Provider`

The Angular provider.
