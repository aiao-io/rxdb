# @aiao/rxdb-i18n-angular

Use an application-owned `I18n` runtime in Angular. If `runtime` uses database persistence, await `runtime.init()` before rendering the component tree. This workspace includes a runnable Angular example.

```sh
pnpm nx serve rxdb-admin-template-angular
```

```ts
import { Component, type ApplicationConfig } from '@angular/core';
import { provideI18n, useI18n } from '@aiao/rxdb-i18n-angular';

export const appConfig: ApplicationConfig = { providers: [provideI18n(runtime)] };

@Component({ template: `{{ i18n.t('greeting') }} ({{ i18n.locale() }})` })
export class Greeting {
  readonly i18n = useI18n();
}
```

`useI18n(runtime?)` subscribes to language and catalog changes. An explicit runtime takes precedence over the provider. Use `useI18nOptional()` in components where the provider is optional, or `useI18nRuntime()` to read just the runtime. Both return `undefined` when the provider is absent.

The binding exposes `t`, `resolve`, `locale`, `availableLocales`, `setLocale`, `formatNumber`, `formatDate`, and `formatRelativeTime`. `resolve(key, namespace?)` reports the matching locale and message source without recording a missing-message diagnostic. Read locale signals by calling them in the template. The binding releases subscriptions on teardown. The application owns `runtime.destroy()`.

[简体中文](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-i18n-angular/README.zh-CN.md)
