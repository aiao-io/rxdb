# @aiao/rxdb-i18n-react

Use an application-owned `I18n` runtime in React. If `runtime` uses database persistence, await `runtime.init()` before rendering the component tree. This workspace includes a runnable React example.

```sh
pnpm nx serve rxdb-admin-template-react
```

```tsx
import { I18nProvider, useI18n } from '@aiao/rxdb-i18n-react';

function App() {
  return (
    <I18nProvider value={runtime}>
      <Greeting />
    </I18nProvider>
  );
}

function Greeting() {
  const { t, locale, setLocale } = useI18n();
  return (
    <button onClick={() => void setLocale('en')}>
      {locale}: {t('greeting')}
    </button>
  );
}
```

`useI18n(runtime?)` subscribes to language and catalog changes. An explicit runtime takes precedence over the provider. Use `useI18nOptional()` in components where the provider is optional, or `useI18nRuntime()` to read just the runtime. Both return `undefined` when the provider is absent.

The binding exposes `t`, `resolve`, `locale`, `availableLocales`, `setLocale`, `formatNumber`, `formatDate`, and `formatRelativeTime`. `resolve(key, namespace?)` reports the matching locale and message source without recording a missing-message diagnostic. Read the locale and available locales from the current render. The binding releases subscriptions on teardown. The application owns `runtime.destroy()`.

[简体中文](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-i18n-react/README.zh-CN.md)
