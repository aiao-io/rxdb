# 客户端国际化 / 本地化研究（@aiao/rxdb 场景）

本文保留消息引擎选型与状态存储的比较依据。当前范围、共享 locale 算法、前置与 AC
统一由 [US-911](stories/future/US-911-client-i18n.md) 定义；数据翻译由 [US-910](stories/future/US-910-data-i18n.md) 消费其接口。
偏好存储与跨 Tab 通知方案尚待验证，研究资料不构成立项或实现完成证据。

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

### 2.1 UI 文案全部硬编码中文

现有 UI 包含中文硬编码，典型入口是
[`buildEditableColumns`](../packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts)、
[`buildDetailTabs`](../packages/rxdb-model/src/entity-detail/detail-tabs.ts) 与
[`TagsEditor`](../packages/rxdb-model/src/entity-table/editors/tags-editor.ts)。

这些符号可作为盘点起点，但旧字符串计数不代表当前库存。US-911 A1 要覆盖框架无关核心、
三端 `.tsx` / `.html` / `.vue` 模板及列表视图配置交互，形成 key、默认中文值与所在符号的完整清单。

### 2.2 依赖与平台能力现状

本方案将消息格式化与平台数字、日期格式化分开：消息语法采用 ICU MessageFormat 1，
消息外的数字、日期与相对时间使用平台 `Intl.*`。运行时能力按 US-911 A2 的目标宿主冒烟验证，
不以某一 Node 版本的探针代替浏览器、Electron 或 Tauri 验收。

### 2.3 可复用的 rxdb 既有能力

- 三端已有响应式查询与 [usePersistedState / PersistedStateRegistry](../packages/utils/src/@browser/persisted-state.ts)；偏好方案应先比较这些既有能力。
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

具体依赖版本、包体与目标宿主可行性在接入时固定并按 US-911 A2 验证；纯 JS 实现不是所有宿主已支持的证据。

### 3.4 自研插值器

不采用。复数、嵌套、转义与消息工具链会引入独立维护成本，复用消息引擎更符合当前目标。

## 4. 结合 rxdb 的优势（为什么 i18n 进 rxdb，而不是再挂一个库）

可验证的收益是离线目录、应用内覆盖与可观测分发。设备语言偏好同时需要持久化、跨 Tab 通知和业务历史隔离，
不能仅为“状态是数据”就强制建实体。

对照两条方案：复用 PersistedState；使用非版本化本地实体。比较首次初始化、刷新、销毁、跨 Tab 更新，
以及 undo / diff / commit、切分支、restore、discard 对偏好的影响。选满足 US-911 A4/A5 且改动最小的路径，
缺少必要能力时先明确引擎前置，不从 `SyncType.None` 推导“不会进入版本历史”。

## 5. 数据模型

### 5.1 `MessageEntry` 实体（per-message 行）

按消息粒度保存目录的理由是覆盖和诊断可以定位到单条文案。本地覆盖与远端目录分开存储，
可以避免远端行缓存清理误删本地覆盖。当前字段、合并优先级与显式注册时机只在
[US-911 数据与 API 契约](stories/future/US-911-client-i18n.md#数据与-api-契约)维护。

### 5.2 `I18nSettings` 实体（单行）

这是候选存储形态，尚非必须建表的合同。设备 locale、显式偏好和默认语言的逻辑字段见
[US-911 显示偏好数据合同](stories/future/US-911-client-i18n.md#显示偏好数据合同)。
实体方案须证明退出业务版本域后仍有 CREATE / UPDATE 通知与跨 Tab 传播；PersistedState 方案同样须满足跨 Tab 和隔离范围要求。

### 5.3 fallback 链（与 US-910 同一契约）

算法的唯一需求源是 [US-911 fallback 链](stories/future/US-911-client-i18n.md#fallback-链共享唯一契约)。
规范化与候选链纯函数不读宿主或存储，默认语言由调用方提供；US-910 只消费同一算法与偏好读接口。
UI 缺失文案如何呈现、数据翻译如何返回缺失值，分别由两条故事定义。

## 6. 运行时矩阵

| 运行时                     | 当前范围 | 验证要求                                            |
| -------------------------- | -------- | --------------------------------------------------- |
| Web                        | 目标范围 | US-911 A2 的消息、复数与 select 冒烟，以及三端 demo |
| Electron                   | 目标范围 | 实际宿主消息引擎冒烟                                |
| Tauri                      | 目标范围 | 实际系统 WebView 消息引擎冒烟                       |
| Node                       | 目标范围 | 固定运行时的消息引擎冒烟                            |
| 微信 / 抖音 / 支付宝小程序 | 排除     | 必要 Intl API 的真机探针独立解锁，不以 Web 结果放行 |

## 7. 阶段路线

阶段 A～D 的前置、当前承诺与关闭条件统一见 [US-911 交付阶段](stories/future/US-911-client-i18n.md#交付阶段)。
先验证文案盘点、消息引擎和偏好方案，再实施核心、三端绑定与组件接线；远端分发和诊断独立排期。

## 8. 决策记录

当前选型是 ICU MessageFormat 1 与框架无关格式化；目录来源、共享接口及可选分发范围以 US-911 为准。
偏好存储、包边界与必要引擎前置仍由阶段 A 验证裁决。本研究保留比较理由，演进过程由 Git 历史记录。

## 参考

- [US-911](stories/future/US-911-client-i18n.md)、[US-910](stories/future/US-910-data-i18n.md)、[数据国际化研究](data-i18n-research.md)
- [能力矩阵](capability-matrix.md)、[US-009](stories/core/US-009-cross-tab-sync.md)、[US-902](stories/future/US-902-devtools-panel.md)
- [FormatJS intl-messageformat](https://formatjs.github.io/docs/intl-messageformat)
- [TC39 proposal-intl-messageformat](https://github.com/tc39/proposal-intl-messageformat)
- [Unicode ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/)
