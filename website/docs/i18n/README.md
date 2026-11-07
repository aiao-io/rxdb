# 客户端国际化

`@aiao/rxdb-i18n` 提供框架无关的 ICU MessageFormat 消息运行时，以及数字、日期和相对时间格式化。静态目录无需数据库；语言偏好、应用覆盖与缺失文案诊断可按需存入 RxDB。

## 静态目录与接入状态

当前包族尚未进入 npm 发布集合，先从仓库工作区验证。包名与代码示例描述当前 main 的接入方式，不能把工作区的 `0.0.28` 当作这些包已经发布的证明。本地运行入口见[能力与示例](../getting-started/capabilities.md)。

```ts
import { I18n } from '@aiao/rxdb-i18n';

const runtime = new I18n({
  defaultLocale: 'zh-Hans',
  locale: 'en',
  catalogs: [
    { locale: 'zh-Hans', namespace: 'app', messages: { greeting: '你好，{name}' } },
    { locale: 'en', namespace: 'app', messages: { greeting: 'Hello, {name}' } }
  ]
});

runtime.t('greeting', { name: 'Ada' });
runtime.formatNumber(1234.5);
runtime.formatDate(new Date(), { dateStyle: 'long' });
await runtime.setLocale('zh-Hans');
```

`t(key, params?, namespace?)` 默认使用 `app` 命名空间。目录支持 ICU 插值、复数与 select。全链缺失返回 key，空字符串是有效消息。

## 三框架绑定

运行时由应用创建，三端 `useI18n(runtime?)` 都提供 `t`、`resolve`、`locale`、`availableLocales`、`setLocale`、`formatNumber`、`formatDate` 和 `formatRelativeTime`。显式传入的运行时优先于 provider。

| 框架    | 提供运行时                                           | 语言状态                          |
| :------ | :--------------------------------------------------- | :-------------------------------- |
| Angular | 注入上下文的 providers 中使用 `provideI18n(runtime)` | `Signal`，读取 `locale()`         |
| React   | `<I18nProvider value={runtime}>`                     | 当前状态值 `locale`               |
| Vue     | 祖先组件 setup 中调用 `provideI18n(runtime)`         | 只读 Ref，脚本读取 `locale.value` |

```tsx
import { I18nProvider, useI18n } from '@aiao/rxdb-i18n-react';

function Greeting() {
  const { t, setLocale } = useI18n();
  return <button onClick={() => void setLocale('en')}>{t('greeting', { name: 'Ada' })}</button>;
}

function App() {
  return (
    <I18nProvider value={runtime}>
      <Greeting />
    </I18nProvider>
  );
}
```

缺少 provider 且未传运行时时，`useI18n()` 立即报错。可选接入使用 `useI18nRuntime()` 或 `useI18nOptional()`，缺少时返回 `undefined`。框架绑定卸载时清理订阅，应用退出时调用 `runtime.destroy()`。

## 持久化与目录优先级

在第一次 `init()` / `connect()` 之前，把 `i18nEntities()` 加入 RxDB 的 `entities`。将数据库传给运行时，先 `await runtime.init()` 再展示依赖语言的首屏：

```ts
import { I18n, i18nEntities } from '@aiao/rxdb-i18n';

// 创建数据库时：entities: [...applicationEntities, ...i18nEntities()]
const runtime = new I18n({ rxdb, defaultLocale: 'zh-Hans', catalogs });
await runtime.init();
await runtime.setLocale('en');
await runtime.setMessages({ locale: 'en', namespace: 'app', messages: { greeting: 'Welcome, {name}' } });
```

语言偏好使用设备本地的 `SyncType.None`，同源多 Tab 沿用 RxDB 的既有通知链路；`multiInstance: false` 不接收其他实例写入。目录按本地覆盖、远端缓存、随包目录的优先级合并。回退依次尝试请求语言、用户偏好语言、设备语言与默认语言，每一步都尝试父语言并去重。

远端目录实体 `RemoteMessageEntry` 默认也不启用同步。需要服务器分发时，在数据库初始化前单独配置 QueryCache，并安装相应插件与适配器；完整示例见仓库 `apps/dev-rxdb-http` 的 `?i18n=1` 页面。应用覆盖与远端缓存分表存储，清除远端缓存不会删除本地覆盖。

## 实体 UI 与诊断

`@aiao/rxdb-model` 导出的 `modelMessages` 提供默认中文，英文通过 `modelEnMessages` 显式加入目录。把同一运行时传给框架 provider 后，实体组件会随语言与目录变化更新。只覆盖部分英文 key 时，剩余内容回退中文；已有组件 options 文案优先。

`inspect()` 返回可序列化的语言、目录与缺失诊断；`flushDiagnostics()` 等待诊断落库，`clearMissingMessages()` 清除缺失记录。后台错误通过 `errors$` 提供。将运行时传给 DevTools 连接器的 `{ i18n: runtime }` 选项，即可使用 [I18n 检视面板](../devtools/README.md)。

运行环境必须具备完整 `Intl.*`。小程序当前不支持；浏览器、Node、Electron 和 Tauri 使用同一运行时冒烟契约验证 ICU、复数和回退行为。
