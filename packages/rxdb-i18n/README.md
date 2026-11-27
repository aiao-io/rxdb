# @aiao/rxdb-i18n

A framework-independent client internationalization runtime for Aiao RxDB. It handles ICU messages, locale negotiation, date and number formatting, catalog overlays, persistence, diagnostics, and reactive updates.

## Use in the workspace

Run this from the consumer package in the cloned workspace.

```bash
pnpm add '@aiao/rxdb-i18n@workspace:*'
```

## Create a runtime

```ts
import { I18n } from '@aiao/rxdb-i18n';

const i18n = new I18n({
  defaultLocale: 'zh-Hans',
  deviceLocale: navigator.language,
  catalogs: [
    { locale: 'zh-Hans', namespace: 'app', messages: { greeting: '你好，{name}' } },
    { locale: 'en', namespace: 'app', messages: { greeting: 'Hello, {name}' } }
  ]
});

i18n.t('greeting', { name: 'Ada' });
i18n.formatDate(new Date(), { dateStyle: 'long' });
await i18n.setLocale('en');
```

`resolveUiLocale()` normalizes `en`, `en-US`, and `en-GB` to `en`, and `zh`, `zh-CN`, and `zh-Hans-CN` to `zh-Hans`. Unknown values use the configured fallback contract.

## Catalogs and persistence

Use `registerCatalog()` for bundled messages. Use `setMessages()` for application overrides and `setRemoteMessages()` for a separately managed remote catalog. Catalogs are resolved by locale, namespace, and key, with the most specific locale first.

For persistence, add `i18nEntities()` to the database entity list before `RxDB.init()` or the first connection, then pass the database to `I18n` and await `i18n.init()` before rendering locale-dependent UI.

```ts
import { I18n } from '@aiao/rxdb-i18n';

const i18n = new I18n({
  rxdb: database,
  defaultLocale: 'zh-Hans',
  deviceLocale: navigator.language,
  catalogs
});

await i18n.init();
```

The runtime exposes `locale$`, `availableLocales$`, `changes$`, and diagnostics APIs. Call `destroy()` when the application-owned runtime is disposed.

## Framework bindings

- `@aiao/rxdb-i18n-angular` provides Angular injection and Signals integration.
- `@aiao/rxdb-i18n-react` provides the React provider and `useI18n()` hook.
- `@aiao/rxdb-i18n-vue` provides Vue injection and `useI18n()` composable.

All bindings consume the same `I18n` instance and catalog contract. Run core tests with:

```bash
pnpm nx test rxdb-i18n --run
```

Read the [English i18n guide](https://rxdb.aiao.io/en/docs/i18n/) and the [Chinese mirror](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-i18n/README.zh-CN.md) for remote catalogs and diagnostics.
