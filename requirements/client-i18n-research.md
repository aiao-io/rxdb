# 客户端国际化 / 本地化研究（@aiao/rxdb 场景）

本文保留消息引擎选型与状态存储的比较依据。当前范围、共享 locale 算法、前置与 AC
统一由 [US-911](stories/future/US-911-client-i18n.md) 定义；数据翻译由 [US-910](stories/future/US-910-data-i18n.md) 消费其接口。
实现使用框架无关 `@aiao/rxdb-i18n` 与三端绑定；偏好载体已按 A4/A5 的方案对照、历史隔离和通知证据冻结，实际证据由故事验收记录和测试维护。

## 1. 范围与术语

| 事项         | 研究边界                           | 当前合同                                 |
| ------------ | ---------------------------------- | ---------------------------------------- |
| UI 文案翻译  | 菜单、表头、按钮、提示语           | US-911                                   |
| 数据内容翻译 | 实体字段的多语言内容               | US-910                                   |
| 格式本地化   | 数字、日期、货币的呈现             | US-911 复用平台 Intl；引擎查询保持字节序 |
| 语言协商     | 显式请求、设备偏好与调用方默认语言 | US-911 的共享纯函数与偏好读接口          |

UI 默认语言与实体默认内容语言可以不同。共享算法不要求两个故事强制共用某个数据库实体，
也不把显示偏好与设备的同步语言集合合并成一个状态。

## 2. 现状盘点

### 2.1 UI 文案迁移清单

迁移前的中文硬编码入口包括
[`buildEditableColumns`](../packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts)、
[`buildDetailTabs`](../packages/rxdb-model/src/entity-detail/detail-tabs.ts) 与
[`TagsEditor`](../packages/rxdb-model/src/entity-table/editors/tags-editor.ts)。

当前盘点见[模型文案清单](client-i18n-inventory.md)与三端 demo 机器清单；覆盖框架无关核心、
三端 `.tsx` / `.html` / `.vue` 模板及列表视图配置交互，每条记录包含 key、默认值与所在符号。旧字符串计数不代表当前库存。

### 2.2 依赖与平台能力现状

本方案将消息格式化与平台数字、日期格式化分开：消息语法采用 ICU MessageFormat 1，
消息外的数字、日期与相对时间使用平台 `Intl.*`。运行时能力按 US-911 A2 的目标宿主冒烟验证，
不以某一 Node 版本的探针代替浏览器、Electron 或 Tauri 验收。

### 2.3 可复用的 rxdb 既有能力

- 三端已有响应式查询与 [usePersistedState / PersistedStateRegistry](../packages/utils/src/@browser/persisted-state.ts)；本次已比较其通知与持久化边界。
- [`RxDBTabsGateway`](../packages/rxdb/src/RxDB.ts) 只覆盖同源 BroadcastChannel 可达范围，不能推导跨进程或任意无日志实体都收到变化。
- QueryCache 分发由 US-212 / US-023 / US-216 承接，可供远端目录使用；不解决设备偏好的历史隔离。
- DevTools 扩展点见 US-902，目录诊断面板另按 US-911 阶段 D 验收。

## 3. 方案空间

### 3.1 平台 `Intl.MessageFormat`

当前方案不依赖该提案 API。消息引擎与数字、日期等已采用的基础 `Intl.*` API 分开选型，
避免消息功能被尚未验证的宿主接口阻塞。

### 3.2 i18next 全家桶

它提供格式化之外的检测、状态与加载器。当前需求只选用独立消息格式化能力，
设备偏好与目录归属由本项目定义；引入另一套完整状态机需要额外协调，因此本轮不采用全家桶。

### 3.3 FormatJS `intl-messageformat`（ICU MessageFormat 1）

当前选型理由：

- ICU 消息语法覆盖插值、复数、选择与转义，可与翻译工具链配合。
- 格式化不绑定 UI 框架，便于让三端共享输入输出。
- 消息格式化与偏好存储、目录加载分别负责，减少状态与生命周期的重复。

当前依赖为 `intl-messageformat@12.1.4`，四类目标宿主已共用一组断言验证，证据见第 6 节；纯 JS 实现本身仍不替代宿主验证。

### 3.4 自研插值器

不采用。复数、嵌套、转义与消息工具链会引入独立维护成本，复用消息引擎更符合当前目标。

## 4. 结合 rxdb 的优势（为什么 i18n 进 rxdb，而不是再挂一个库）

可验证的收益是离线目录、应用内覆盖与可观测分发。设备语言偏好同时需要持久化、跨 Tab 通知和业务历史隔离，
不能仅为“状态是数据”就强制建实体。

对照两条方案：复用 PersistedState；使用非版本化本地实体。比较首次初始化、刷新、销毁、跨 Tab 更新，
以及 undo / diff / commit、切分支、restore、discard 对偏好的影响。选满足 US-911 A4/A5 且改动最小的路径，
缺少必要能力时先明确引擎前置，不从 `SyncType.None` 推导“不会进入版本历史”。本次对照已完成，选择复用已有非版本化实体与通知网关。

### 偏好载体对照

现有 `PersistedStateRegistry` 对照测试使用两个已初始化、共用同一 storage key 的注册表：A 写入 `en` 后，B 的订阅不触发且仍保持旧值；显式派发 `StorageEvent` 也不更新 B，新建注册表才从盘上恢复 `en`。测试位于 [PersistedState 对照用例](../packages/utils/src/__tests__/@browser/persisted-state.spec.ts)，单文件 31 条和 utils 整包 983 条测试通过；现有退订用例覆盖解除 listener。

| 边界         | 现有 PersistedStateRegistry                                          | 本次非版本化实体实现                                                                                  |
| ------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 隔离身份     | 同源 `namespace + name`，片段转义；调用方自行纳入应用/数据库维度     | 物理本地库中的 `i18n.settings` / `singleton`；逻辑 dbName 同时界定网关频道，不同数据库使用不同 dbName |
| 持久化与刷新 | 浏览器 localStorage；新注册表可恢复，Node/SSR 仅内存                 | 复用 RxDB 本地适配器；已有偏好行不被初始化覆盖                                                        |
| 通知与销毁   | 同一注册表内通知；退订解除本实例 listener；当前不监听 storage        | 提交后发既有实体事件，响应式查询与 RxDBTabsGateway 驱动；运行时销毁清理订阅                           |
| 同源跨 Tab   | 已初始化注册表不会跟随另一个 Tab 的写入                              | 既有双实例与三端真实浏览器验收已验证；multiInstance:false 不接收通知                                  |
| 业务版本域   | localStorage 天然不属于数据库历史；不代表已具备跨 Tab 和多宿主持久化 | `log:false` 退出既有版本域，`SyncType.None` 只负责不跨设备同步；历史隔离专项已通过                    |
| 尚需能力     | 跨 Tab storage 订阅与生命周期，以及 Node/非浏览器持久化适配          | 复用现有适配器、查询与网关，无新增引擎能力                                                            |

目录覆盖与诊断本就使用 RxDB，偏好采用同一非版本化实体路线只复用现有适配器、事务、EntityManager 事件和 TabsGateway。PersistedState 虽天然不进业务历史，但补齐跨 Tab 与非浏览器持久后端会增加另一套状态与通知生命周期，因此本次不扩建第二套偏好存储。

### 共享读取与依赖边界

纯函数固定由 `@aiao/rxdb-i18n` 提供，`locale.ts` 不导入框架、数据库、宿主探测或存储。设备偏好读取使用已公开的 `I18nSettings` 与 `firstValueFrom(rxdb.entityManager.getRepository(I18nSettings).get('singleton'))`；数据侧仅消费 `devicePreferredLocale` / `deviceLocale`，调用 `buildLocaleChain()` 时显式提供实体的 `defaultLocale`，不继承 UI 存储的应用默认语言。无 UI、无数据库的调用方直接传入相同逻辑字段复用纯函数，不需要初始化运行时。

依赖方向为数据翻译核心 → 框架无关 locale/偏好接口；不依赖 `rxdb-i18n-{angular,react,vue}` 或 `rxdb-model`，也不另建一份偏好实体或 fallback 算法。

## 5. 数据模型

### 5.1 `MessageEntry` 实体（per-message 行）

按消息粒度保存目录的理由是覆盖和诊断可以定位到单条文案。本地覆盖与远端目录分开存储，
可以避免远端行缓存清理误删本地覆盖。当前字段、合并优先级与显式注册时机只在
[US-911 数据与 API 契约](stories/future/US-911-client-i18n.md#数据与-api-契约)维护。

### 5.2 `I18nSettings` 实体（单行）

该存储形态已由 A4/A5 的对照与历史隔离证据冻结。设备 locale、显式偏好和默认语言的逻辑字段见
[US-911 显示偏好数据合同](stories/future/US-911-client-i18n.md#显示偏好数据合同)。
实体使用 `SyncType.None` + `log: false`，避免继承实例同步策略和进入版本域；CREATE / UPDATE 通知由提交后的已有实体事件提供，沿原 RxDBTabsGateway 传播。单行初始化采用同一事务的 create-if-absent；真实双实例、`multiInstance: false` 边界和三端跨 Tab 已验证。

[历史隔离专项](../packages/rxdb-i18n/src/preference-history-isolation.spec.ts) 3 条通过：切语言不进入 undo、changelog、status、diff 或业务 commit；业务 undo/redo 仍实际回退/重放 Note，往返两分支、restore 旧 commit 与 discard 均不回退语言。该结果验证了现有 `log:false` 版本边界和显式实体通知组合，无新增引擎能力。

### 5.3 fallback 链（与 US-910 同一契约）

算法的唯一需求源是 [US-911 fallback 链](stories/future/US-911-client-i18n.md#fallback-链共享唯一契约)。
规范化与候选链纯函数不读宿主或存储，默认语言由调用方提供；US-910 只消费同一算法与偏好读接口。
UI 缺失文案如何呈现、数据翻译如何返回缺失值，分别由两条故事定义。实现落点为 `@aiao/rxdb-i18n` 的 `canonicalizeLocale`、`buildLocaleChain` 和 `resolveMessage`，不导入框架绑定、不自行探测宿主或访问数据库。

## 6. 运行时矩阵

| 运行时                     | 当前范围 | 验证要求                                            |
| -------------------------- | -------- | --------------------------------------------------- |
| Web                        | 目标范围 | US-911 A2 的消息、复数与 select 冒烟，以及三端 demo |
| Electron                   | 目标范围 | 实际宿主消息引擎冒烟                                |
| Tauri                      | 目标范围 | 实际系统 WebView 消息引擎冒烟                       |
| Node                       | 目标范围 | 固定运行时的消息引擎冒烟                            |
| 微信 / 抖音 / 支付宝小程序 | 排除     | 必要 Intl API 的真机探针独立解锁，不以 Web 结果放行 |

### A2 实际运行验证

2026-10-28 在 macOS / arm64 验证。四类运行时使用同一 `@aiao/rxdb-i18n/testing` 的 `assertI18nRuntimeSmoke()`。该入口不依赖 Vitest；验证参数插值、单复数、select 指定与默认分支、`fr-CA → fr` 父语言回退和默认中文回退，返回实际消息输出。

| 运行时          | 验证入口                                                                                                                                             | 本机结果                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Node            | `pnpm nx test rxdb-i18n`，`src/runtime-smoke.spec.ts`                                                                                                | 通过共享断言                                                                                |
| Web             | `pnpm nx run rxdb-i18n:test-browser`，真实 Chromium                                                                                                  | 1 条通过                                                                                    |
| Electron 44.9.3 | `dev-rxdb-electron:electron-package-dir` 后运行 `dev-rxdb-electron-e2e:e2e --args='src/electron-smoke.spec.ts --grep=ICU' --excludeTaskDependencies` | 真实 `.app` 渲染页 1 条通过；冷打包 1 分 03 秒，运行 3.8 秒                                 |
| Tauri 2.12.5    | `dev-rxdb-tauri:tauri-package-release` 后运行 `dev-rxdb-tauri-e2e:desktop-smoke --args='src/desktop-persistence.spec.ts' --excludeTaskDependencies`  | 真实 release WebView、Rust 自检 JSON 2 条通过；冷打包 4 分 41 秒，其中 Rust 编译 3 分 17 秒 |

原生验证平台为 macOS / arm64。Electron 用 Playwright 从真实渲染页读取共享断言的输出；Tauri 通过已有启动探针在原生 WebView 执行，结果以 JSON 字符串写入 Rust 报告的 `message` 字段，其中 `i18nRuntimeSmoke` 保存实际输出。ICU 失败沿现有 `status: 'failed'` 通道上报，单测已验证该失败分支。Node 适配器测试没有计作原生运行时证据。

## 7. 阶段路线

阶段 A～D 的前置、当前承诺与关闭条件统一见 [US-911 交付阶段](stories/future/US-911-client-i18n.md#交付阶段)。
先验证文案盘点、消息引擎和偏好方案，再实施核心、三端绑定与组件接线；远端分发和诊断独立排期。

## 8. 决策记录

当前选型是 ICU MessageFormat 1 与框架无关格式化；目录来源、共享接口及可选分发范围以 US-911 为准。
实现包为 `@aiao/rxdb-i18n` 与 `rxdb-i18n-{angular,react,vue}`；共享纯函数和偏好读取停留在框架无关核心，US-910 不依赖 UI 绑定。A4/A5 已验证当前实体方案的通知与历史边界。现有 PersistedState 缺跨 Tab 通知和非浏览器持久适配，本次不扩建第二套偏好存储；选用实体方案未增加引擎前置。本研究保留比较理由，演进过程由 Git 历史记录。

## 参考

- [US-911](stories/future/US-911-client-i18n.md)、[US-910](stories/future/US-910-data-i18n.md)、[数据国际化研究](data-i18n-research.md)
- [能力矩阵](capability-matrix.md)、[US-009](stories/core/US-009-cross-tab-sync.md)、[US-902](stories/future/US-902-devtools-panel.md)
- [FormatJS intl-messageformat](https://formatjs.github.io/docs/intl-messageformat)
- [TC39 proposal-intl-messageformat](https://github.com/tc39/proposal-intl-messageformat)
- [Unicode ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/)
