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
   响应式查询驱动所有订阅组件重渲染；同源多 Tab 经 `RxDBTabsGateway` 传播。不用 localStorage / 全局单例
   （不响应、跨 Tab 要另造通道、进不了 DevTools）。
3. **目录两层合并：包内默认（bundle）+ 本地库 per-message 覆盖（db）。** 合并键 `(locale, namespace, key)`，
   db 覆盖 bundle；空字符串是合法值、不触发 fallback。rxdb-model 内置 zh-Hans 默认目录随包发布，
   不注册覆盖时默认渲染与现在逐字一致（Never break userspace）；既有 options 参数（如 `buildEditableColumns`
   的 `actionsTitle`）优先级高于目录。
4. **与 US-910 共享 locale 规范化与 fallback 链，用户显示偏好同源。** BCP 47 规范化与 fallback 链
   （请求 locale → 用户显式偏好 → 设备 locale → defaultLocale）只实现一份；本故事的
   `I18nSettings.preferredLocale` 就是 US-910 决策 5 的「用户显示偏好」，数据翻译的 fallback 读取同一实体。
   两个故事都不把一个设备的语言选择同步为其他设备的选择。
5. **小程序运行时明确排除，不写 fallback。** iOS JSCore 的 Intl 系列 API 缺失、仓库无真机探针；
   处理方式与搜索的 `unverified` 一致：明确声明不支持。解锁条件 = 真机探针证明所需 Intl API 存在。
6. **rxdb-model 框架无关核心走命令式 `t()`，三框架绑定走响应式 `useI18n()`。** 核心的 DOM 编辑器
   （`TagsEditor` 等）没有框架生命周期，读注入的翻译函数；绑定包只负责响应式生命周期与销毁清理，
   三端同签名（`tri-framework-check`）。

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

| #   | 前置条件                                                | 操作                                                                                 | 预期结果                                                                                                                                     | 状态 |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| A1  | 盘点脚本/表覆盖 rxdb-model 四包与三端 demo 的全部用户可见字符串 | 按表逐行复核：每行含 key、默认中文值、所在符号（`buildEditableColumns` / `buildDetailTabs` / 各 editor） | 盘点表是后续改 key 的唯一清单；抽查任意 10 行，key 与符号一一对应，无遗漏的编辑器 hint / placeholder / 列头 / 空态                              | ⬜   |
| A2  | `intl-messageformat` 接入冒烟                          | 在 web / electron / tauri / node 四类运行时跑插值、复数、select 用例；小程序真机探针记录 Intl 缺失事实 | 四类运行时全绿；探针结论写入研究文档运行时矩阵，小程序排除结论可复验                                                                      | ⬜   |
| A3  | 目录合并与 fallback 纯函数单测                          | db 覆盖 bundle、空字符串合法值、全链缺失、链去重、BCP 47 canonicalization 拒绝非法 locale | 合并优先级 db > bundle；全链缺失返回 `value: undefined` 不抛错；canonicalization 后重复 locale fail-fast                                       | ⬜   |
| A4  | 两个同源 tab 连同一库                                   | 单行 `I18nSettings` 写入 + `locale$` 订阅，tab A 切换语言                             | tab B 的订阅收到新 locale；`multiInstance: false` 实例的边界行为与 `RxDBTabsGateway` 注释一致并有测试钉住                                       | ⬜   |

### 阶段 B — `@aiao/rxdb-i18n` 核心与三端绑定

| #   | 前置条件                                          | 操作                                                                          | 预期结果                                                                                                                        | 状态 |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---- |
| B1  | 阶段 A 完成                                       | 初始化 `@aiao/rxdb-i18n`：注册目录、写入 `I18nSettings`、调用 `t()` / `formatNumber` / `formatDate` / `formatRelativeTime` | 目录合并、fallback、ICU 格式化全绿；构造期校验（非法 locale、重复 `(locale,namespace,key)`）fail-fast；不初始化数据库也能用纯静态目录的 `t()`（无库模式） | ⬜   |
| B2  | 三端绑定包就位                                     | 调用 `useI18n()`：`{ t, locale, availableLocales, setLocale, formatNumber, formatDate }` | 三端同签名同语义；`setLocale()` 后所有订阅组件自动重渲染；组件销毁不泄漏订阅；`tri-framework-check` 通过                            | ⬜   |
| B3  | 阶段 B 交付前                                     | 执行 lint / typecheck / test / build / coverage、补齐 API baseline            | 新包覆盖率 ≥ 80%；TSDoc 齐备；零 ESLint 警告；`api-surface.mjs --check` 收录新导出                                                    | ⬜   |

### 阶段 C — rxdb-model 去硬编码与三端 demo

| #   | 前置条件                                        | 操作                                                                             | 预期结果                                                                                                                                  | 状态 |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| C1  | 阶段 B 完成，盘点表（A1）就绪                   | rxdb-model 四包按盘点表替换为 key；内置 zh-Hans 目录随包发布                     | 未注册任何覆盖时，三端组件默认渲染与改前**逐字一致**（快照测试）；既有 options 参数（`actionsTitle` 等）优先级高于目录                        | ⬜   |
| C2  | C1 完成                                         | 应用注册自有 en 目录覆盖 `rxdb-model.*` key                                      | 覆盖生效且只影响被覆盖 key；未覆盖 key 回退 zh-Hans；重启后覆盖仍在（db 持久）                                                             | ⬜   |
| C3  | 三端 demo 接入                                 | 加语言切换器（zh-Hans / en）；e2e：切换 → 表头/按钮/提示即时变化 → 刷新后保持 → 第二 tab 跟随 | 三端 e2e 全绿；切换全程不刷新页面；数字/日期列按 locale 格式化可见（`formatDate` 至少一处落地）                                              | ⬜   |
| C4  | C1～C3 完成                                     | 执行三端 parity 与全量门禁                                                       | `tri-framework-check` 通过；rxdb-model 四包与 demo 的 affected lint / test / build / e2e 全绿                                            | ⬜   |

### 阶段 D — 目录远端分发与可观测（可选后置，独立关闭）

| #   | 前置条件                                        | 操作                                                                             | 预期结果                                                                                                                                  | 状态 |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| D1  | HTTP 分发链路（US-212 / US-023 / US-216）       | 目录作为 QueryCache 实体从参考后端分发；远端改一条文案                            | 客户端经 changeFeed 失效上报拉到新值并即时重渲染；离线时仍渲染本地缓存版                                                                  | ⬜   |
| D2  | D1 完成                                         | 缺失 key 写入本地诊断实体；DevTools 面板显示当前 locale、目录来源、缺失 key 列表 | 面板逐行检视；缺失 key 不打断渲染（回退链照常），诊断行可清空                                                                             | ⬜   |
| D3  | D1 完成                                         | 远端删除一条覆盖行                                                                | 本地回退到 bundle 默认值；不回退成缺失                                                                                                      | ⬜   |

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

- `(locale, namespace, key)` 唯一，是合并键；db 覆盖 > bundle 默认。
- 本地库中不存在该行时回退 bundle 内置目录；两者都没有时进入 fallback 链。

### `I18nSettings` 实体（单行，本地实体不同步）

```text
id               string         // 'singleton'
deviceLocale     string         // 宿主探测值
preferredLocale  string | null  // 用户显式选择（= US-910 的「用户显示偏好」）
defaultLocale    string
```

### fallback 链（与 US-910 同一契约）

```text
显式请求 locale（当前 UI 语言）→ preferredLocale → deviceLocale → defaultLocale
```

缺失行与空字符串语义不同；全链缺失返回 `value: undefined`；链去重。

### `useI18n()` 三端契约

```ts
useI18n(): {
  t: (key: string, params?: Record<string, unknown>) => string;
  locale: string;                            // 当前生效 locale（响应式）
  availableLocales: string[];                // 已注册目录的 locale 集合（响应式）
  setLocale: (locale: string) => Promise<void>;
  formatNumber: (n: number, opts?: Intl.NumberFormatOptions) => string;
  formatDate: (d: Date, opts?: Intl.DateTimeFormatOptions) => string;
};
```

框架层只负责响应式生命周期（Angular signal / React hook / Vue composable），核心语义在同名函数中共享。

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
