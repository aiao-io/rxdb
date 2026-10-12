# 客户端国际化 / 本地化研究（@aiao/rxdb 场景）

> 本文是 US-911 的设计依据，不是用户故事。结论已经收敛：消息引擎采用 ICU MessageFormat 的
> `intl-messageformat`（FormatJS 参考实现，纯函数、无框架绑定）；locale 状态作为 **rxdb 单行实体**
> 存储（切换语言 = 写一行数据）；目录分「包内默认（bundle）+ 本地库 per-message 覆盖（db）」两层；
> 小程序运行时明确排除，不写 fallback。

## 1. 范围与术语

国际化拆成四件事，与[数据国际化研究](./data-i18n-research.md)同一分法，边界互补：

| 事项         | 定义                                               | 负责故事                     |
| ------------ | -------------------------------------------------- | ---------------------------- |
| UI 文案翻译  | 组件菜单、表头、按钮、提示语的按语言文案           | 本故事（US-911）             |
| 数据内容翻译 | 实体字段按语言存多份值                             | [US-910](stories/future/US-910-data-i18n.md) |
| 格式本地化   | 日期、数字、货币按 locale 格式化                   | 本故事，限「复用平台 Intl」  |
| 语言协商     | 请求语言、用户偏好、设备语言的 fallback 链         | 两故事共享同一契约           |

「客户端国际化」要回答的是：rxdb-model 组件与宿主应用的 UI 文案如何按语言渲染、语言状态放在哪、
切换语言如何传播、目录从哪里来。数据翻译（US-910）回答的是实体字段内容的多语言存储与同步，
两者共享 locale 规范化、fallback 链与「用户显示偏好」这份状态，详见 §5.3 与决策记录 6。

## 2. 现状盘点

### 2.1 UI 文案全部硬编码中文

rxdb-model 的框架无关核心与三端绑定包中，用户可见文案全部是硬编码中文字符串。2026-10-12 量级盘点
（`grep -o` 统计字面量匹配次数、非行数；同一行可含多处。精确到 key 的盘点在阶段 A 交付，且**必须覆盖
模板扩展名**——三端绑定包的 `.tsx` / `.html` / `.vue` 模板里另有中文文案，如 `dialog.tsx`、
`entity-detail.html` 的「保存」，只扫 `*.ts` 会漏掉它们）：

```bash
grep -rn --include="*.ts" -o -P "'[^']*[\x{4e00}-\x{9fff}][^']*'|\"[^\"]*[\x{4e00}-\x{9fff}][^\"]*\"|\`[^\`]*[\x{4e00}-\x{9fff}][^\`]*\`" \
  packages/rxdb-model/src packages/rxdb-model-angular/src packages/rxdb-model-react/src packages/rxdb-model-vue/src \
  | grep -v __tests__ | grep -v "\.spec\." | grep -v "^\s*\*" | grep -v "//" | wc -l
# → 207 处字符串字面量（180 行）
```

典型符号锚点（改 key 时逐处替换）：

[`buildEditableColumns()`](../packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts) 的默认列头与操作标签：

```ts
const {
  relatedItemsProviderFactory,
  actionsTitle = '操作',
  deleteLabel = '删除',
  viewLabel = '查看',
  createdAtTitle = '创建时间',
  updatedAtTitle = '更新时间'
} = options;
```

[`buildDetailTabs()`](../packages/rxdb-model/src/entity-detail/detail-tabs.ts) 的固定标签：

```ts
const formTab: DetailFormTab = {
  key: 'basic',
  label: '基本信息',
  type: 'form'
};
```

[`TagsEditor`](../packages/rxdb-model/src/entity-table/editors/tags-editor.ts) 的输入提示与操作提示：

```ts
input.placeholder = this.#mode === 'number' ? '输入数字 Enter 添加' : '输入后 Enter 添加';
hint.textContent = 'Enter /逗号 添加 · Backspace 删除 · Esc 取消';
```

demo 应用同样：`apps/dev-rxdb-angular/src/app` 下 103 处（同一条命令换目录）。**结论**：非中文用户
拿到 rxdb-model 组件时，每一项操作入口都是中文，这是今天可复现的具体症状。

### 2.2 依赖与平台能力现状

- 全仓 `package.json`（根、`packages/*`、`apps/*`、`modules/*`）无任何 i18n 库——`i18next` / `vue-i18n` /
  `ngx-translate` / `formatjs` / `@lingui` 均无（`grep -rh` 复验为空）。
- `packages/rxdb/src`、`packages/utils/src`、`packages/rxdb-model/src` 无 `Intl.` 调用。
- **平台 `Intl.MessageFormat` 尚未落地，不能作为运行时依赖**。2026-10-12 实测：

```bash
node -e "console.log(process.version, typeof Intl.MessageFormat)"
# node v24.18.0 undefined（Node 26.7.0 同样 undefined）
```

  它仍是 TC39 提案（`tc39/proposal-intl-messageformat`）。基础 API（`Intl.NumberFormat` /
  `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat` / `Intl.PluralRules` / `Intl.getCanonicalLocales`）
  均已标准化，Node 实测存在。
- `intl-messageformat@12.1.3`（`npm view intl-messageformat version`，2026-10-05 仍在发布）是 FormatJS
  的 ICU MessageFormat 参考实现：纯函数、自带解析器、不依赖平台 `Intl.MessageFormat`、无框架绑定。

### 2.3 可复用的 rxdb 既有能力

- **响应式查询三端对称**：`useGet` / `useFind` / `useFindOne` 等 hook 三端齐备（见
  [capability-matrix 跨框架 API 对称矩阵](./capability-matrix.md#跨框架-api-对称矩阵)）。
- **跨 Tab 网关**：[`RxDBTabsGateway`](../packages/rxdb/src/RxDB.ts)（`#gateway` 字段，BroadcastChannel
  实现）。其注释明示范围：「**只覆盖同源的 BroadcastChannel 可达范围。** 跨进程（Electron 主/渲染、
  Tauri、Node 多进程）与 `multiInstance: false` 的实例收不到」。
- **QueryCache 分发链路已交付**：HTTP 适配器（US-212）、变更失效上报（US-023）、参考后端（US-216）
  均已 Done——阶段 D 的目录远端分发可直接复用，不需要 Full/Filter 同步夹具。
- **DevTools 扩展已交付**（US-902），阶段 D 的 i18n 面板挂接点存在。

## 3. 方案空间

### 3.1 平台 `Intl.MessageFormat`

**排除**。2026-10-12 在 Node 24 / 26 实测 `undefined`，仍是 TC39 提案；「零依赖走平台 API」在
消息格式化上今天不成立。格式化数字/日期仍走平台 `Intl.*`（已标准化），两者不冲突。

### 3.2 i18next 全家桶

**排除**。i18next 自带语言检测、状态机与 backend 加载器——但本方案的 locale 状态归 rxdb
（响应式、跨 Tab、可检视），i18next 的状态机会绕过 rxdb，实际只用得到 `t()` 这一个函数却引入整套框架。
三端绑定是三套生态（react-i18next / i18next-vue / angular-i18next），各自生命周期与 API 习惯不同，
违反「三框架 API 对称」铁律。

### 3.3 FormatJS `intl-messageformat`（ICU MessageFormat 1）

**采纳**。理由：

- ICU 是消息格式标准（CLDR 生态，复数/选择/转义规则明确），目录文本可被翻译工具链识别；
- 纯函数、无状态、无框架绑定——状态归 rxdb，格式化归它，各司其职；
- 自带解析器，不依赖平台 `Intl.MessageFormat`，浏览器/Electron/Tauri/Node 全覆盖；
- 活跃维护（12.1.3，2026-10-05 发布）。

数字/日期/相对时间的消息外格式化用平台 `Intl.NumberFormat` / `Intl.DateTimeFormat` /
`Intl.RelativeTimeFormat`，消息内嵌数字/日期经 ICU 参数交给 Intl 完成。

### 3.4 自研插值器

**排除**。i18n 格式化（复数、性别、转义、嵌套）是著名 tar pit，违反「信任上游」。

## 4. 结合 rxdb 的优势（为什么 i18n 进 rxdb，而不是再挂一个库）

1. **离线优先是唯一路径，不是降级路径。** 目录与 locale 状态都在本地库：首屏即正确语言，
   无网络依赖、无「先英文后中文」的闪变。
2. **切换语言 = 写一行数据。** locale 状态是 `I18nSettings` 单行实体，`setLocale()` 是一次事务写；
   所有订阅组件经响应式查询自动重渲染，不需要事件总线或手动刷新，三端复用既有 hook 模式。
3. **跨 Tab 语言一致。** 同源多 Tab 经 `RxDBTabsGateway` 传播，A 窗口切语言 B 窗口即时跟随
   （范围以 §2.3 的注释为准）。
4. **用户偏好与数据国际化同源。** US-910 决策 5 的「用户显示偏好」就是本故事的 `devicePreferredLocale`；
   UI 文案 fallback 与数据翻译 fallback 走同一份链、读同一份状态，数据语言和 UI 语言不会分叉。
5. **目录是可同步数据（阶段 D）。** 翻译团队改文案 = 改数据，经 QueryCache 分发（远端权威 +
   本地行缓存 + changeFeed 失效上报，均已交付）；远端目录与本地覆盖**分实体存储**，同步的 orphan
   清理只作用于远端实体，本地覆盖永不被远端删除；客户端离线时永远有上一版可用。冲突域 = 单条文案。
6. **缺失 key 可观测。** 缺失 key 写入本地诊断实体，DevTools 面板逐行检视（阶段 D）。

## 5. 数据模型

### 5.1 `MessageEntry` 实体（per-message 行）

```text
id         string primary key   // (locale|namespace|key) 确定性编码，禁止裸拼接
locale     string               // BCP 47 canonical
namespace  string               // 'rxdb-model' | 应用自定义
key        string
value      string               // ICU MessageFormat 源文本；空字符串是合法值
source     'bundle' | 'db' | 'remote'
updatedAt  date
```

- `(locale, namespace, key)` 唯一索引，是合并键。
- **本地覆盖（`source: 'db'`）与远端目录（`source: 'remote'`）是两个实体、两张表**，行身份不共享：
  QueryCache 的 orphan 清理只作用于远端实体，**本地覆盖永不被远端覆盖或删除**；远端缺某 key 不等于
  删除本地覆盖，D3 的删除语义只在远端实体内收敛。
- 合并优先级 **db 覆盖 > remote 远端 > bundle 默认**；`source` 只做诊断，不参与合并。
- 目录注册与远端合入两条写入入口都做 ICU MessageFormat 语法校验，非法条目拒绝入库/合入（fail-fast）；
  因此查找期不存在非法条目，不需要运行时兜底。
- per-message 行的理由：覆盖粒度 = 单条文案、缺失检测天然成立、远端同步的冲突域 = 单条文案（LWW）、
  DevTools 可逐行检视。目录总量是千级行，不是性能问题。

### 5.2 `I18nSettings` 实体（单行）

```text
id                      string         // 'singleton'
deviceLocale            string         // 宿主探测值
devicePreferredLocale   string | null  // 用户显式选择，字段名与 US-910 决策 5 的「用户显示偏好」一致
defaultLocale           string
```

- 实体显式声明 `type: SyncType.None`（[`SyncType`](../packages/rxdb/src/entity/sync-options.interface.ts)
  枚举的 `None` 值），**不继承实例级默认同步策略**——语言偏好不 push 到其他设备（US-910 决策 5）。
- 单行初始化是 **create-if-absent**（insert-or-ignore / upsert）：两个 tab 并发首次初始化时，
  落败方不因主键冲突失败，而是重读该行继续；设备 locale 不同步到其他设备（US-910 决策 5）。

### 5.3 fallback 链（与 US-910 同一契约）

```text
显式请求 locale（当前 UI 语言）
→ 用户显式偏好（devicePreferredLocale）
→ 设备 locale
→ defaultLocale
```

- **链上每个节点先查精确 locale，再按 BCP 47 父语言降级**（`fr-CA` → `fr` → 下一节点），
  不因地域变体缺失而跳过已存在的父语言目录；父语言规则在纯函数中固定并测试。
- BCP 47 规范化用 `Intl.getCanonicalLocales()`，无法规范化的 locale 拒绝。
- 空字符串是已存在的文案值，不触发 fallback；`t()` 全链缺失时**返回 key 本身**（不抛、渲染安全），
  并写入缺失 key 诊断实体（阶段 D）。数据翻译侧的 `resolveTranslation` 仍按 US-910 契约返回
  `value: undefined`，两者语义分开。
- 链去重，重复语言不重复查询。
- 这份链与 US-910 `resolveTranslation` 的 fallback 语义一致，纯函数只实现一份，落点见决策记录 6。

## 6. 运行时矩阵

| 运行时                                   | 判定              | 依据                                                                        |
| ---------------------------------------- | ----------------- | --------------------------------------------------------------------------- |
| 浏览器（现代 Chrome / Firefox / Safari） | ✅ supported      | `intl-messageformat` 纯 JS；基础 `Intl.*` Safari 14+                         |
| Electron                                 | ✅ supported      | 自带 Chromium                                                               |
| Tauri                                    | ✅ supported      | 系统 WebKit（WKWebView），同上                                              |
| Node 26+                                 | ✅ supported      | 基础 `Intl.*` 实测存在（§2.2）                                              |
| 小程序（微信 / 抖音 / 支付宝）           | ❌ 明确排除        | iOS JSCore 的 Intl 系列缺失、仓库无真机探针；与搜索 `unverified` 同一处理：**明确声明不支持，不写 fallback** |

小程序解锁条件 = 真机探针证明所需 Intl API 存在（独立记录，不在本故事 AC 内）。

## 7. 阶段路线

- **阶段 A 盘点与可行性验证**：全量文案盘点表（每行含 key、默认中文值、所在符号）；消息引擎与
  fallback 纯函数在 web / electron / tauri / node 四类运行时的冒烟；`I18nSettings` 单行实体 +
  跨 Tab 传播冒烟。
- **阶段 B 核心运行时与三端绑定**：`@aiao/rxdb-i18n`（目录注册与合并、ICU 消息引擎、locale 状态、
  fallback 纯函数、命令式 `t()`）+ 三端 `useI18n()` 绑定。不依赖任何同步能力。
- **阶段 C rxdb-model 去硬编码与 demo**：全部盘点文案（`.ts` 207 处 + 三端模板文案）改 key，默认 zh-Hans 目录随包发布；三端 demo
  语言切换器 + e2e。
- **阶段 D 目录远端分发与可观测（可选后置，独立关闭）**：目录走 QueryCache 分发（前置已 Done）、
  缺失 key 诊断实体、DevTools i18n 面板。

## 8. 决策记录

1. 消息引擎采用 `intl-messageformat`（ICU MessageFormat 1）；平台 `Intl.MessageFormat` 未落地，
   不作为运行时依赖；数字/日期/相对时间格式化用平台 `Intl.*`。
2. locale 状态是数据不是配置：rxdb 单行实体 `I18nSettings`（显式 `SyncType.None`、create-if-absent
   初始化），不用 localStorage / 全局单例。
3. 目录三层合并：**db 覆盖 > remote 远端 > bundle 默认**，合并键 `(locale, namespace, key)`；
   远端目录与本地覆盖分实体存储，同步 orphan 清理不碰本地覆盖。
4. rxdb-model 内置 zh-Hans 默认目录随包发布；不注册任何覆盖时默认渲染与现在逐字一致
   （Never break userspace），既有 options 参数（如 `buildEditableColumns` 的 `actionsTitle`）
   优先级高于目录。
5. 小程序运行时明确排除，不写 fallback；真机 Intl 探针是**独立解锁条件**，不进入本故事任何阶段的 AC。
6. 与 US-910 共享 BCP 47 规范化（含父语言降级）、fallback 链契约与「用户显示偏好」状态：持久化字段名
   统一为 `devicePreferredLocale`；纯函数只实现一份，落点任选 `@aiao/rxdb-i18n` 或 `@aiao/utils`、
   不得双实现；US-910 的数据翻译 fallback 读取本故事的 `I18nSettings.devicePreferredLocale` / `deviceLocale`。
7. 包命名：客户端运行时用 `@aiao/rxdb-i18n`（+ `rxdb-i18n-{angular,react,vue}`）。它与 US-910 规划的
   `rxdb-plugin-i18n`（数据翻译）存在命名重叠——两个包都不存在、两条故事都在 Backlog，实现期由 owner
   裁决改名一方（推荐 US-910 改 `@aiao/rxdb-plugin-translation`），本文不修改 US-910。
8. rxdb-model 框架无关核心（DOM 编辑器等）走命令式 `t()`，并**订阅 locale 变化刷新已打开的编辑器文案**；
   三框架绑定走响应式 `useI18n()`。
9. 目录注册与远端合入时校验 ICU 语法（非法条目拒绝）；`t()` 全链缺失返回 key 本身并记录诊断，
   不在渲染路径上抛错或返回 `undefined`。

## 参考

- 本仓库：[US-911](stories/future/US-911-client-i18n.md)、[US-910](stories/future/US-910-data-i18n.md)、
  [数据国际化研究](data-i18n-research.md)、[US-009](stories/core/US-009-cross-tab-sync.md)、
  [US-212](stories/adapter/US-212-http-adapter.md)、[US-023](stories/core/US-023-querycache-remote-invalidation.md)、
  [US-902](stories/future/US-902-devtools-panel.md)、[capability-matrix](capability-matrix.md)
- 代码：`packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts`、
  `packages/rxdb-model/src/entity-detail/detail-tabs.ts`、`packages/rxdb-model/src/entity-table/editors/tags-editor.ts`、
  `packages/rxdb/src/RxDB.ts`
- 外部：[FormatJS intl-messageformat](https://formatjs.github.io/docs/intl-messageformat)、
  [TC39 proposal-intl-messageformat](https://github.com/tc39/proposal-intl-messageformat)、
  [Unicode ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/)
