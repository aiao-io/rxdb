# @aiao/rxdb-i18n-vue

Use an application-owned `I18n` runtime in Vue. If `runtime` uses database persistence, await `runtime.init()` before rendering the component tree. This workspace includes a runnable Vue example.

```sh
pnpm nx serve rxdb-admin-template-vue
```

Provide the runtime in an ancestor component’s setup function.

```ts
import { provideI18n } from '@aiao/rxdb-i18n-vue';

provideI18n(runtime);
```

Read it in a descendant component.

```vue
<script lang="ts" setup>
import { useI18n } from '@aiao/rxdb-i18n-vue';

const { t, locale, setLocale } = useI18n();
</script>

<template>
  <button @click="setLocale('en')">{{ locale }}: {{ t('greeting') }}</button>
</template>
```

`useI18n(runtime?)` subscribes to language and catalog changes. An explicit runtime takes precedence over the provider. Use `useI18nOptional()` in components where the provider is optional, or `useI18nRuntime()` to read just the runtime. Both return `undefined` when the provider is absent.

The binding exposes `t`, `resolve`, `locale`, `availableLocales`, `setLocale`, `formatNumber`, `formatDate`, and `formatRelativeTime`. `resolve(key, namespace?)` reports the matching locale and message source without recording a missing-message diagnostic. Vue exposes locale state through readonly refs that templates unwrap. The binding releases subscriptions on teardown. The application owns `runtime.destroy()`.

[简体中文](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-i18n-vue/README.zh-CN.md)
