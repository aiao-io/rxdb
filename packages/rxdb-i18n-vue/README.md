# @aiao/rxdb-i18n-vue

`@aiao/rxdb-i18n` 的 Vue 绑定。运行时由应用创建；持久化模式先 `await runtime.init()`，再展示依赖语言的组件。

```ts
import { provideI18n, useI18n } from '@aiao/rxdb-i18n-vue';

// 祖先组件 setup
provideI18n(runtime);

// 后代组件 setup
const { t, locale, setLocale } = useI18n();
// 模板：{{ t('greeting') }} / {{ locale }}
```

`useI18n(runtime?)` 返回 `t`、`locale`、`availableLocales`、`setLocale`、`formatNumber`、`formatDate`、`formatRelativeTime`。显式参数优先于 provider；无 provider 且未传入运行时时立即报错。

`locale` / `availableLocales` 在 Angular 中是 `Signal`，React 中是当前状态值，Vue 中是只读 `Ref` / `ComputedRef`。目录更新也会触发使用 `t()` 的组件重渲染。绑定销毁时清理全部订阅，运行时的销毁由应用负责。

`useI18nRuntime()` 仅返回当前 provider 的运行时，缺少时为 `undefined`；`useI18nOptional()` 进一步建立响应式绑定，缺少时同样为 `undefined`。这两个入口供可选接入国际化的组件使用。
