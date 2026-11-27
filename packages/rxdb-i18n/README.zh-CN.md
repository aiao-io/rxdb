# @aiao/rxdb-i18n

框架无关的客户端国际化运行时。ICU MessageFormat 由 `intl-messageformat` 解析，数字、日期、相对时间使用宿主 `Intl.*`。语言偏好和应用覆盖目录可存入 RxDB，组件通过原生响应式绑定即时更新。

## 静态目录

```ts
import { I18n } from '@aiao/rxdb-i18n';

const i18n = new I18n({
  defaultLocale: 'zh-Hans',
  locale: 'en',
  catalogs: [
    { locale: 'zh-Hans', namespace: 'app', messages: { greeting: '你好，{name}', count: '{count} 条' } },
    {
      locale: 'en',
      namespace: 'app',
      messages: { greeting: 'Hello, {name}', count: '{count, plural, one {# item} other {# items}}' }
    }
  ]
});

i18n.t('greeting', { name: 'Ada' });
i18n.t('count', { count: 2 });
i18n.formatDate(new Date(), { dateStyle: 'long' });
await i18n.setLocale('zh-Hans');
```

无库模式构造后即可使用。`t(key, params?, namespace?)` 缺省命名空间为 `app`，可通过构造选项 `namespace` 修改；全链缺失返回 key，空字符串是有效消息。

## 持久化与跨 Tab

在创建数据库时把 `i18nEntities()` 加入 `config.entities`，必须早于 `RxDB.init()` / 首次 `connect()`：

```ts
import { i18nEntities, I18n } from '@aiao/rxdb-i18n';

// 创建 RxDB 的 options：entities: [...applicationEntities, ...i18nEntities()]
const i18n = new I18n({ rxdb, defaultLocale: 'zh-Hans', catalogs });
await i18n.init();
await i18n.setLocale('en');
```

持久化模式先 `await init()`，再展示依赖语言的首屏。`I18nSettings` 仅有 `singleton` 一行，显式声明 `SyncType.None`；语言选择保留在当前设备，同源多 Tab 通过已有 `RxDBTabsGateway` 跟随。`multiInstance: false` 实例不接收其他实例的写入。

`deviceLocale` 保存首次创建偏好行时的宿主探测值，重开沿用该值；运行时不会自动覆盖它。`updatedAt` 是偏好行内部的单调修订时间，确保同一毫秒内切换语言也会触发响应式查询。

运行时的 `locale$`、`availableLocales$`、`changes$` 提供同步快照及后续变更，三端分别使用 `@aiao/rxdb-i18n-angular` / `-react` / `-vue` 的 `useI18n()`。应用结束时调用 `i18n.destroy()` 清理订阅，数据库由应用独立销毁。

## 目录覆盖与回退

目录按同一 `(locale, namespace, key)` 合并，优先级为本地 `db` 覆盖、远端缓存、随包 `bundle`。本地与远端分表保存，删除远端缓存不会删除应用覆盖。

```ts
await i18n.setMessages({ locale: 'en', namespace: 'rxdb-model', messages: { 'common.save': 'Publish' } });
await i18n.removeMessages('en', 'rxdb-model', ['common.save']);
```

`registerCatalog()` 注册随包目录，同一身份重复注册立即报错；`setMessages()` 创建或更新本地覆盖；`setRemoteMessages()` / `removeRemoteMessages()` 管理独立的远端缓存。目录写入前校验 BCP 47 语言与 ICU 语法。

回退顺序为请求语言、用户 `devicePreferredLocale`、宿主 `deviceLocale`、`defaultLocale`，每个节点先取精确语言再取父语言，例如 `fr-CA → fr`，全链去重。`canonicalizeLocale()` 与 `buildLocaleChain()` 是数据国际化可复用的唯一实现。

## 远端目录

`RemoteMessageEntry` 默认使用 `SyncType.None`，全本地应用无需远端或同步插件。需要分发目录时，在 `RxDB.init()` 前通过 `syncOverrides` 将该实体单独配置为 QueryCache；库级 `sync` 同时声明对应的本地和远端适配器，并安装 QueryCache 插件。本地 `MessageEntry` 与 `I18nSettings` 继续保持 `SyncType.None`。

```ts
syncOverrides: [
  {
    entity: RemoteMessageEntry,
    sync: {
      type: SyncType.QueryCache,
      local: { adapter: 'wa-sqlite' },
      remote: { adapter: 'http' }
    }
  }
];
```

远端查询使用既有本地优先与离线缓存选项。网络不可达且远端缓存为空时，空目录让随包目录继续生效；恢复查询由宿主 `reachability` 监视器驱动，不新增定时器或跨 Tab 通道。业务错误遵循 QueryCache 既有语义；销毁运行时会释放查询和监视资源。完整接入与远端修改 / 删除示例见 `apps/dev-rxdb-http` 的 `?i18n=1` 页面。

## rxdb-model 与诊断

把 `@aiao/rxdb-model` 的 `modelMessages` 加入构造目录，组件即可通过绑定包的 provider 使用同一个运行时。`modelMessages` 只注册默认中文；英文目录通过导出的 `modelEnMessages` 显式注册。应用只覆盖部分英文 key 时，其余 key 回退中文；既有组件 options 文案仍优先。未配置 provider 时，模型组件保留原有数字与日期时间输出；显式提供运行时后，日期列按 locale 格式化并保留时分秒。

持久模式的缺失 key 写入 `MissingMessageEntry`；`flushDiagnostics()` 等待已排队写入，`clearMissingMessages()` 清空诊断。后台写入或外部目录校验异常经 `errors$` 提供。

`await i18n.inspect()` 返回可序列化的 `I18nInspection`：当前语言、可用语言、全部目录层与缺失诊断。消息的 `active` 表示同一 `(locale, namespace, key)` 身份的最高优先级版本。`inspection$` 通知目录、语言及诊断变化；诊断清空仅通知检视者，避免应用重新翻译后立即重复记录缺失 key。DevTools 通过显式注入这一结构端口显示 I18n 面板：`getDevToolsConnector().init(rxdb, getEntityMetadata, { i18n })`。只有连接允许变更时才显示诊断清空入口；清空定向到缺失文案表，保留其它设置和语言偏好。

本包要求宿主具备完整 `Intl.*`。小程序运行时明确不支持，真机 Intl 探针通过后才可独立解锁。

## 运行时冒烟

`testing` 子路径提供不依赖测试框架的同一组 ICU 断言，用于在实际宿主运行时验证插值、复数、select、父语言与默认语言回退：

```ts
import { assertI18nRuntimeSmoke } from '@aiao/rxdb-i18n/testing';

const result = await assertI18nRuntimeSmoke();
```

失败会抛出含具体用例的错误，由宿主已有错误通道处理。仓库的 Node 单测、真实 Chromium 测试、Electron 打包渲染进程和 Tauri release WebView 共用该入口。Tauri 的失败沿 `status: 'failed'` 进入 Rust 自检 JSON，成功输出记录在报告 `message` 的 `i18nRuntimeSmoke` 中；Electron 用 Playwright 从真实渲染页读取结果。
