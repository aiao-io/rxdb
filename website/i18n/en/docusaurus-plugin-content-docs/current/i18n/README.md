# Client internationalization

`@aiao/rxdb-i18n` provides a framework-independent ICU message runtime plus locale-aware number, date, and relative-time formatting. Static catalogs work without a database. Persisted preferences, application overrides, and missing-message diagnostics are optional.

## Register catalogs

```typescript
import { I18n, resolveUiLocale } from '@aiao/rxdb-i18n';

const runtime = new I18n({
  defaultLocale: 'zh-Hans',
  deviceLocale: resolveUiLocale(globalThis.navigator?.language),
  catalogs: [
    { locale: 'zh-Hans', namespace: 'app', messages: { greeting: '你好，{name}' } },
    { locale: 'en', namespace: 'app', messages: { greeting: 'Hello, {name}' } }
  ]
});

runtime.t('greeting', { name: 'Ada' });
```

## Locale contract

The current UI contract supports `en` and `zh-Hans`. English regional tags such as `en-US` resolve to `en`; `zh`, `zh-CN`, and `zh-Hans-CN` resolve to `zh-Hans`. Unknown or invalid values fall back to `zh-Hans`.

Use `deviceLocale` to supply the host language. Call `await runtime.setLocale('en')` when the user selects English. In the Admin templates, clearing the language preference restores the host language. Pass the active locale to date, number, relative-time, and user-interface sorting functions. Protocol fields, entity names, SQL identifiers, and stable serialized output keep their existing values.

## Framework bindings

Use `@aiao/rxdb-i18n-angular`, `@aiao/rxdb-i18n-react`, or `@aiao/rxdb-i18n-vue` to connect the runtime to the framework lifecycle. The Admin templates use the same preference behavior across all three frameworks.
