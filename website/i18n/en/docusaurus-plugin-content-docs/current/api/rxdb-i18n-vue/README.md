# rxdb-i18n-vue

The Vue binding for `@aiao/rxdb-i18n`. The runtime is created by the application; in persistent mode call `await runtime.init()` first, then render the components that depend on the language.

```ts
import { provideI18n, useI18n } from '@aiao/rxdb-i18n-vue';

// in the setup of an ancestor component
provideI18n(runtime);

// in the setup of a descendant component
const { t, locale, setLocale } = useI18n();
// template: {{ t('greeting') }} / {{ locale }}
```

`useI18n(runtime?)` returns `t`, `resolve`, `locale`, `availableLocales`, `setLocale`, `formatNumber`, `formatDate`, `formatRelativeTime`. An explicit argument takes precedence over the provider; it throws immediately when there is no provider and no runtime was passed.

`locale` / `availableLocales` are `Signal`s in Angular, current state values in React, and read-only `Ref` / `ComputedRef` in Vue. Catalog updates also re-render components that use `t()`. All subscriptions are cleaned up when the binding is destroyed; destroying the runtime is the application's responsibility.

`useI18nRuntime()` only returns the current provider's runtime, `undefined` when missing; `useI18nOptional()` additionally establishes a reactive binding and likewise returns `undefined` when missing. These two entry points are for components that opt into i18n optionally.

`resolve(key, namespace?)` inspects the message source and the language that matched, without recording missing diagnostics; when the catalog or language changes, the framework binding recomputes the UI that consumes it.

## Interfaces

| Interface | Description |
| ------ | ------ |
| [I18nBinding](interfaces/I18nBinding.md) | The Vue native reactive i18n binding. |

## Variables

| Variable | Description |
| ------ | ------ |
| [I18N](variables/I18N.md) | The i18n runtime in the current component tree. |

## Functions

| Function | Description |
| ------ | ------ |
| [provideI18n](functions/provideI18n.md) | Provides the runtime to descendant components; destruction is the caller's responsibility. |
| [useI18n](functions/useI18n.md) | Subscribes to the current i18n runtime; the subscription is cleaned up when the effect scope is destroyed. |
| [useI18nOptional](functions/useI18nOptional.md) | Subscribes to an optional provider; no subscription is created when missing. |
| [useI18nRuntime](functions/useI18nRuntime.md) | Optionally reads the current provider's runtime. |
