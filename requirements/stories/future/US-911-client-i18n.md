---
id: US-911
title: 客户端国际化 / 本地化（UI 文案与 locale 状态）
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-10-12
updated: 2026-10-12
tags: [i18n, rxdb-model, tri-framework, plugin]
---

# 用户故事：客户端国际化 / 本地化（UI 文案与 locale 状态）

## 作为/我想要/以便

**作为** 使用 `@aiao/rxdb` 与 `@aiao/rxdb-model` 组件构建应用的开发者
**我想要** 一套以 rxdb 为状态的客户端国际化运行时——rxdb-model 组件的文案不再硬编码中文，语言偏好作为数据存入本地库并按响应式查询驱动三框架重渲染、同源多 Tab 即时跟随，应用可注册自己的目录覆盖任意 key
**以便** 把应用交付给非中文用户：离线首屏即正确语言、切换语言无需刷新、目录可远端分发，且数据语言（US-910）与 UI 语言共享同一份偏好与 fallback 链

## 设计决策

1. **消息引擎采用 FormatJS `intl-messageformat`（ICU MessageFormat 1），不用平台 `Intl.MessageFormat`。**
   `Intl.MessageFormat` 仍是 TC39 提案，2026-10-12 在 Node 26.7.0 实测 `undefined`；`intl-messageformat@12.1.3`
   是 ICU 参考实现，纯函数、无框架绑定、活跃维护。消息外的数字/日期/相对时间格式化用平台 `Intl.*`。
2. **locale 状态是数据不是配置：存 rxdb 单行实体 `I18nSettings`。** `setLocale()` 是一次事务写，
   响应式查询驱动所有订阅组件重渲染；同源多 Tab 经 `RxDBTabsGateway` 传播。实体显式声明 `SyncType.None`
   （不继承实例级默认同步策略，偏好不 push 到其他设备），单行初始化用 create-if-absent 吸收并发首次
   初始化的主键冲突。不用 localStorage / 全局单例（不响应、跨 Tab 要另造通道、进不了 DevTools）。
3. **目录三层合并：db 覆盖 > remote 远端 > bundle 默认。** 合并键 `(locale, namespace, key)`；
   远端目录与本地覆盖**分实体存储**，QueryCache orphan 清理只作用于远端实体，本地覆盖永不被远端
   覆盖或删除；空字符串是合法值、不触发 fallback。目录注册与远端合入时校验 ICU MessageFormat 语法，
   非法条目拒绝（fail-fast）。rxdb-model 内置 zh-Hans 默认目录随包发布，不注册覆盖时默认渲染与现在
   逐字一致（Never break userspace）；既有 options 参数（如 `buildEditableColumns` 的 `actionsTitle`）
   优先级高于目录。
4. **与 US-910 共享 locale 规范化与 fallback 链，用户显示偏好同源。** BCP 47 规范化（含父语言降级：
   链上每个节点先查精确 locale 再查其父语言，`fr-CA` 缺失时先降 `fr` 再进下一节点）与 fallback 链
   （请求 locale → 用户显式偏好 → 设备 locale → defaultLocale）只实现一份；持久化字段名统一为
   `devicePreferredLocale`，本故事的 `I18nSettings.devicePreferredLocale` 就是 US-910 决策 5 的
   「用户显示偏好」，数据翻译的 fallback 读取同一实体。两个故事都不把一个设备的语言选择同步为其他设备
   的选择。
5. **小程序运行时明确排除，不写 fallback。** iOS JSCore 的 Intl 系列 API 缺失、仓库无真机探针；
   处理方式与搜索的 `unverified` 一致：明确声明不支持。真机 Intl 探针是**独立解锁条件**，不进入
   本故事任何阶段的 AC。
6. **rxdb-model 框架无关核心走命令式 `t()`，三框架绑定走响应式 `useI18n()`。** 核心的 DOM 编辑器
   （`TagsEditor` 等）没有框架生命周期，读注入的翻译函数，并**订阅 locale 变化刷新已打开编辑器的
   placeholder / hint / 错误文案**；绑定包只负责响应式生命周期与销毁清理，三端同签名
   （`tri-framework-check`）。

## 范围边界

### In Scope

- 框架无关 i18n 运行时：目录注册与合并、ICU 消息格式化、`t()` / `formatNumber` / `formatDate` /
  `formatRelativeTime`
- `I18nSettings` 单行实体与 `MessageEntry` per-message 实体（见「数据与 API 契约」）
- 响应式 `locale$`、fallback 链与 BCP 47 canonicalization 纯函数
- 三端 `useI18n()` 绑定（Angular signal 函数 / React hook / Vue composable），同签名同语义
- rxdb-model 四包全部用户可见文案改 key（含编辑器提示、列头、详情 tab、空态），默认 zh-Hans 目录随包发布
- 应用对 rxdb-model key 注册自有目录的覆盖能力
- 三端 demo 语言切换器（zh-Hans / en 至少两门）与对应 e2e
- 阶段 D：目录经 QueryCache 远端分发、缺失 key 诊断实体、DevTools i18n 面板

### Out of Scope

- 数据内容翻译（US-910 的多语言实体）
- 机翻、翻译管理后台、翻译工作流
- 小程序运行时（解锁条件见设计决策 5）
- 自研日期/数字格式化引擎（用平台 `Intl.*`）
- Angular `$localize` 编译期方案（三框架不共享，违反对称铁律）
- 已发布应用存量文案的自动迁移（rxdb-model 的 key 化随 1.0 前的发布窗口交付）
- 语言列表的运行时动态注册（目录 locale 是数据可增删，但内置默认目录编译期固定）

## 前置依赖

- 阶段 A / B / C **无硬前置**：全本地能力，不依赖同步夹具。
- 阶段 D 复用已交付的 QueryCache 分发链路（US-212 / US-023 / US-216），DevTools 面板复用 US-902 扩展架构；
  无未完成前置，作为可选后置阶段独立关闭。
- 与 US-910 的协调：fallback 链与 locale 规范化纯函数只实现一份（本故事或 `@aiao/utils`，落点见
  [client-i18n-research 决策记录 6](../../client-i18n-research.md#8-决策记录)）；`rxdb-plugin-i18n` 与
  `@aiao/rxdb-i18n` 的包名重叠由 owner 在实现期裁决（决策记录 7）。

## 验收标准

### 阶段 A — 盘点与可行性验证（不改引擎、不改已发布组件）

| #   | 前置条件                                                                                                 | 操作                                                                                                                  | 预期结果                                                                                                                                                                                | 状态 |
| --- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| A1  | 盘点脚本/表覆盖 rxdb-model 四包与三端 demo 的全部用户可见字符串（**含 `.tsx` / `.html` / `.vue` 模板**） | 按表逐行复核：每行含 key、默认中文值、所在符号（`buildEditableColumns` / `buildDetailTabs` / 各 editor / 各模板文件） | 盘点表是后续改 key 的唯一清单；抽查任意 10 行，key 与符号一一对应，无遗漏的编辑器 hint / placeholder / 列头 / 空态 / 模板文案                                                           | ⬜   |
| A2  | `intl-messageformat` 接入冒烟                                                                            | 在 web / electron / tauri / node 四类运行时跑插值、复数、select 用例                                                  | 四类运行时全绿；小程序排除结论在研究文档运行时矩阵中可复验（真机探针是独立解锁条件，不在本故事 AC 内）                                                                                  | ⬜   |
| A3  | 目录合并与 fallback 纯函数单测                                                                           | db 覆盖 bundle、空字符串合法值、全链缺失、链去重、BCP 47 canonicalization 拒绝非法 locale                             | 合并优先级 db > bundle；全链缺失返回 `value: undefined` 不抛错；canonicalization 后重复 locale fail-fast                                                                                | ⬜   |
| A4  | 两个同源 tab 连同一库                                                                                    | 单行 `I18nSettings` 写入 + `locale$` 订阅，tab A 切换语言；两 tab 对空库并发首次初始化                                | tab B 的订阅收到新 locale；并发初始化经 create-if-absent 收敛为一行、落败方重读后继续（无主键冲突失败）；`multiInstance: false` 实例的边界行为与 `RxDBTabsGateway` 注释一致并有测试钉住 | ⬜   |

### 阶段 B — `@aiao/rxdb-i18n` 核心与三端绑定

| #   | 前置条件       | 操作                                                                                                                       | 预期结果                                                                                                                                                                                                                                                                                                                         | 状态 |
| --- | -------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| B1  | 阶段 A 完成    | 初始化 `@aiao/rxdb-i18n`：注册目录、写入 `I18nSettings`、调用 `t()` / `formatNumber` / `formatDate` / `formatRelativeTime` | 目录合并、fallback、ICU 格式化全绿；构造期校验（非法 locale、重复 `(locale,namespace,key)`、非法 ICU 语法）fail-fast；i18n 实体经包导出的 `i18nEntities()` 在 `RxDB.init()` 前加入 `config.entities`（init 后缺失 fail-fast）；`t(key, params, namespace?)` 支持命名空间选择；不初始化数据库也能用纯静态目录的 `t()`（无库模式） | ⬜   |
| B2  | 三端绑定包就位 | 调用 `useI18n()`：`{ t, locale, availableLocales, setLocale, formatNumber, formatDate, formatRelativeTime }`               | 三端同签名同语义、`locale` / `availableLocales` 按**框架原生响应式类型**暴露（Angular `Signal` / React 状态 / Vue `Ref`），`setLocale()` 后所有订阅组件自动重渲染；组件销毁不泄漏订阅；`tri-framework-check` 通过                                                                                                                | ⬜   |
| B3  | 阶段 B 交付前  | 执行 lint / typecheck / test / build / coverage、补齐 API baseline                                                         | 新包覆盖率 ≥ 80%；TSDoc 齐备；零 ESLint 警告；`api-surface.mjs --check` 收录新导出                                                                                                                                                                                                                                               | ⬜   |

### 阶段 C — rxdb-model 去硬编码与三端 demo

| #   | 前置条件                      | 操作                                                                                          | 预期结果                                                                                                                                                                                                  | 状态 |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| C1  | 阶段 B 完成，盘点表（A1）就绪 | rxdb-model 四包按盘点表替换为 key；内置 zh-Hans 目录随包发布                                  | 未注册任何覆盖时，三端组件默认渲染与改前**逐字一致**（快照测试）；既有 options 参数（`actionsTitle` 等）优先级高于目录；**已打开的 DOM 编辑器在语言切换后刷新 placeholder / hint / 错误文案**（无需重开） | ⬜   |
| C2  | C1 完成                       | 应用注册自有 en 目录覆盖 `rxdb-model.*` key                                                   | 覆盖生效且只影响被覆盖 key；未覆盖 key 回退 zh-Hans；重启后覆盖仍在（db 持久）                                                                                                                            | ⬜   |
| C3  | 三端 demo 接入                | 加语言切换器（zh-Hans / en）；e2e：切换 → 表头/按钮/提示即时变化 → 刷新后保持 → 第二 tab 跟随 | 三端 e2e 全绿；切换全程不刷新页面；数字/日期列按 locale 格式化可见（`formatDate` 至少一处落地）                                                                                                           | ⬜   |
| C4  | C1～C3 完成                   | 执行三端 parity 与全量门禁                                                                    | `tri-framework-check` 通过；rxdb-model 四包与 demo 的 affected lint / test / build / e2e 全绿                                                                                                             | ⬜   |

### 阶段 D — 目录远端分发与可观测（可选后置，独立关闭）

| #   | 前置条件                                  | 操作                                                                             | 预期结果                                                                                                                       | 状态 |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---- |
| D1  | HTTP 分发链路（US-212 / US-023 / US-216） | 目录作为 QueryCache 实体从参考后端分发；远端改一条文案                           | 客户端经 changeFeed 失效上报拉到新值并即时重渲染；离线时仍渲染本地缓存版                                                       | ⬜   |
| D2  | D1 完成                                   | 缺失 key 写入本地诊断实体；DevTools 面板显示当前 locale、目录来源、缺失 key 列表 | 面板逐行检视；缺失 key 不打断渲染（回退链照常），诊断行可清空                                                                  | ⬜   |
| D3  | D1 完成                                   | 远端删除一条目录行                                                               | 合并按 db > remote > bundle 回退：有本地覆盖回退到 db 覆盖、否则回退到 bundle 默认值；本地覆盖行不受远端删除影响、不回退成缺失 | ⬜   |

## 数据与 API 契约

### `MessageEntry` 实体（per-message 行）

```text
id         string primary key   // (locale|namespace|key) 确定性编码，禁止裸拼接
locale     string               // BCP 47 canonical
namespace  string               // 'rxdb-model' | 应用自定义
key        string
value      string               // ICU MessageFormat 源文本；空字符串是合法值
source     'bundle' | 'db' | 'remote'   // 诊断用，不参与合并
updatedAt  date
```

- `(locale, namespace, key)` 唯一，是合并键；合并优先级 **db 覆盖 > remote 远端 > bundle 默认**。
- **本地覆盖（db）与远端目录（remote）是两个实体、两张表**：QueryCache orphan 清理只作用于远端实体，
  本地覆盖永不被远端覆盖或删除。
- 目录注册与远端合入时校验 ICU MessageFormat 语法，非法条目拒绝（fail-fast）。
- 实体类经包导出的 `i18nEntities()` 在 `RxDB.init()` / `SchemaManager.init()` 之前显式加入
  `config.entities`；init 之后才注册的实例 fail-fast（与 US-910 决策 6 同一注册时机约束）。

### `I18nSettings` 实体（单行）

```text
id                      string         // 'singleton'
deviceLocale            string         // 宿主探测值
devicePreferredLocale   string | null  // 用户显式选择（字段名与 US-910 决策 5 一致）
defaultLocale           string
```

- 实体显式声明 `type: SyncType.None`，不继承实例级默认同步策略——语言偏好不 push 到其他设备。
- 单行初始化是 create-if-absent：两个 tab 并发首次初始化时落败方不因主键冲突失败，重读该行继续。

### fallback 链（与 US-910 同一契约）

```text
显式请求 locale（当前 UI 语言）→ devicePreferredLocale → deviceLocale → defaultLocale
```

- 链上每个节点先查精确 locale，再按 BCP 47 父语言降级（`fr-CA` → `fr`）。
- 缺失行与空字符串语义不同；链去重。
- `t()` 全链缺失返回 **key 本身**（不抛、渲染安全）并写入缺失 key 诊断实体；数据翻译侧的
  `resolveTranslation` 仍按 US-910 契约返回 `value: undefined`。

### `useI18n()` 三端契约

```ts
useI18n(): {
  t: (key: string, params?: Record<string, unknown>, namespace?: string) => string;
  locale: /* 框架原生响应式类型 */ string;            // 当前生效 locale
  availableLocales: /* 框架原生响应式类型 */ string[]; // 已注册目录的 locale 集合
  setLocale: (locale: string) => Promise<void>;
  formatNumber: (n: number, opts?: Intl.NumberFormatOptions) => string;
  formatDate: (d: Date, opts?: Intl.DateTimeFormatOptions) => string;
  formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit, opts?: Intl.RelativeTimeFormatOptions) => string;
};
```

- 三端签名与语义一致；`locale` / `availableLocales` 在各自框架暴露为原生响应式类型——
  Angular `Signal<string>` / `Signal<string[]>`、React hook 状态（重渲染驱动）、Vue `Ref<string>` /
  `ComputedRef<string[]>`——共享的核心只产出可订阅的源，框架层负责类型适配与销毁清理。

## 实现文件

- `packages/rxdb-i18n/` — 框架无关核心：目录注册与合并、ICU 消息引擎接入、`I18nSettings` / `MessageEntry`
  实体 schema 与 repository、fallback 与 canonicalization 纯函数、命令式 `t()` 服务（含无库静态目录模式）
- `packages/rxdb-i18n-angular/` / `packages/rxdb-i18n-react/` / `packages/rxdb-i18n-vue/` — `useI18n()` 三端绑定
- `packages/rxdb-model/` — 内置 zh-Hans 默认目录、文案 key 迁移、翻译函数注入点与既有 options 优先级
- `packages/rxdb-model-{angular,react,vue}/` — 组件文案改用核心目录
- `apps/dev-rxdb-{angular,react,vue}/` + 对应 e2e — 语言切换器与验收
- 阶段 D：`apps/dev-rxdb-http*`（目录分发演示）、`packages/rxdb-devtools/`（i18n 面板）、
  `packages/rxdb/` 的 `RxDBTabsGateway` 仅消费不修改

## References

- [客户端国际化研究](../../client-i18n-research.md)
- [US-910 数据国际化](./US-910-data-i18n.md) 与 [数据国际化研究](../../data-i18n-research.md)
- [US-009 跨 Tab 同步](../core/US-009-cross-tab-sync.md)
- [US-212 HTTP 远程适配器](../adapter/US-212-http-adapter.md)、[US-023 QueryCache 失效上报](../core/US-023-querycache-remote-invalidation.md)
- [US-902 DevTools 面板](./US-902-devtools-panel.md)
- [capability-matrix 跨框架 API 对称矩阵](../../capability-matrix.md)
- 外部：[FormatJS intl-messageformat](https://formatjs.github.io/docs/intl-messageformat)、
  [TC39 proposal-intl-messageformat](https://github.com/tc39/proposal-intl-messageformat)
- [Epic: 未来功能](../../epics/epic-004-future-features.md)
