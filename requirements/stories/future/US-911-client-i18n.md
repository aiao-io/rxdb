---
id: US-911
title: 客户端国际化 / 本地化（UI 文案与 locale 状态）
status: In Review
priority: Medium
epic: epic-004-future-features
created: 2026-10-12
updated: 2026-10-28
tags: [i18n, rxdb-model, tri-framework, plugin]
---

# 用户故事：客户端国际化 / 本地化（UI 文案与 locale 状态）

## 作为/我想要/以便

**作为** 使用 `@aiao/rxdb` 与 `@aiao/rxdb-model` 组件构建应用的开发者
**我想要** 一套客户端国际化运行时——rxdb-model 组件的文案不再硬编码中文，语言偏好持久保存并驱动三框架重渲染、同源多 Tab 即时跟随，应用可注册自己的目录覆盖任意 key
**以便** 把应用交付给非中文用户：离线首屏即正确语言、切换语言无需刷新、目录可远端分发，且数据语言（US-910）与 UI 语言共享同一份偏好与 fallback 链

当前实现进入代码评审；A～D 已交付，偏好载体已按 A4/A5 的方案对照、历史隔离与通知证据冻结。实现与验收事实见下文。

## 设计决策

1. **消息引擎采用 FormatJS `intl-messageformat`（ICU MessageFormat 1），不用平台 `Intl.MessageFormat`。**
   `Intl.MessageFormat` 仍是 TC39 提案，2026-10-12 在 Node 26.7.0 实测 `undefined`；`intl-messageformat@12.1.3`
   是 ICU 参考实现，纯函数、无框架绑定、活跃维护。消息外的数字/日期/相对时间格式化用平台 `Intl.*`。
2. **locale 是设备偏好，不属于用户业务版本。** 切换语言不得进入撤销栈、工作树 diff 或 commit，切分支、restore 与 discard
   不得回退语言偏好；同源多 Tab 仍须收到变化。阶段 A 先比较两条方案：
   - 复用三端 `usePersistedState()` 与 [`PersistedStateRegistry`](../../../packages/utils/src/@browser/persisted-state.ts)，补齐跨 Tab 订阅与生命周期；
   - 使用非版本化的本地实体，但先证明 CREATE/UPDATE 通知与跨 Tab 传播。只写 `SyncType.None` 不能退出版本历史；
     `log: false` 也不自动给自定义实体提供更新通知。
     以最小可验收改动裁决。若依赖引擎能力，先登记、评审并交付前置，不通过直接写系统表或手工强刷界面规避。

   本次对照选用 `I18nSettings` 非版本化本地实体：`SyncType.None` + `log:false`，提交后使用已有实体事件触发查询与网关通知。历史隔离与方案对照均已实测，无新增引擎前置，详见实现与验收记录。

3. **目录三层合并：db 覆盖 > remote 远端 > bundle 默认。** 合并键 `(locale, namespace, key)`；
   远端目录与本地覆盖**分实体存储**，QueryCache orphan 清理只作用于远端实体，本地覆盖永不被远端
   覆盖或删除；空字符串是合法值、不触发 fallback。目录注册与远端合入时校验 ICU MessageFormat 语法，
   非法条目拒绝（fail-fast）。rxdb-model 内置 zh-Hans 默认目录随包发布，不注册覆盖时默认渲染与现在
   逐字一致（Never break userspace）；既有 options 参数（如 `buildEditableColumns` 的 `actionsTitle`）
   优先级高于目录。
4. **本故事是 locale 规范化、fallback 算法与显示偏好接口的唯一需求源。** 数据翻译（US-910）消费同一份纯函数与偏好读接口，
   不反向依赖 UI 组件或另建偏好实体。纯函数由调用方显式提供 `defaultLocale`：UI 用应用默认语言，数据翻译用实体默认内容语言，
   两者可以不同。字段名统一为 `devicePreferredLocale`；持久化载体由阶段 A 裁决，两个故事都不把一个设备的选择同步到其他设备。
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
- 设备偏好存储与通知适配（方案由阶段 A 冻结）、`MessageEntry` per-message 目录实体
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

## 交付阶段

| 阶段 | 交付                                               | 前置                  | 关闭条件                                  | 状态 |
| ---- | -------------------------------------------------- | --------------------- | ----------------------------------------- | ---- |
| A    | 文案盘点、共享 locale 算法、偏好存储与通知方案验证 | 立项授权              | A1～A5；选定方案满足历史隔离与跨 Tab 通知 | ✅   |
| B    | i18n 核心与三端绑定                                | A；必要引擎前置已交付 | B1～B3                                    | ✅   |
| C    | 当前 rxdb-model 文案接线与三端 demo                | B                     | C1～C4，包含当前列表视图设置及编辑器文案  | ✅   |
| D    | 远端目录分发与诊断                                 | C；独立排期           | D1～D3                                    | ✅   |

## 前置依赖

- 阶段 A 不依赖 Full-sync 夹具；阶段 B / C 依赖 A 冻结的偏好存储、通知与历史边界，以及验证后登记的必要引擎前置。
- 阶段 D 复用已交付的 QueryCache 分发链路（US-212 / US-023 / US-216），DevTools 面板复用 US-902 扩展架构；
  无未完成前置，作为可选后置阶段独立关闭。
- 与 US-910 的协调：共享纯函数、偏好读接口与包依赖方向在阶段 A 冻结；数据翻译不得依赖 UI 绑定包，两故事不得各建一份 fallback。
  包名与核心落点在新增包之前确定，研究资料跟随本故事合同同步。

## 验收标准

### 阶段 A — 盘点与可行性验证（不改引擎、不改已发布组件）

| #   | 前置条件                                                                                                 | 操作                                                                                                                  | 预期结果                                                                                                                                                                 | 状态 |
| --- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| A1  | 盘点脚本/表覆盖 rxdb-model 四包与三端 demo 的全部用户可见字符串（**含 `.tsx` / `.html` / `.vue` 模板**） | 按表逐行复核：每行含 key、默认中文值、所在符号（`buildEditableColumns` / `buildDetailTabs` / 各 editor / 各模板文件） | 盘点表是后续改 key 的唯一清单；抽查任意 10 行，key 与符号一一对应，无遗漏的编辑器 hint / placeholder / 列头 / 空态 / 模板文案                                            | ✅   |
| A2  | `intl-messageformat` 接入冒烟                                                                            | 在 web / electron / tauri / node 四类运行时跑插值、复数、select 用例                                                  | 四类运行时全绿；小程序排除结论在研究文档运行时矩阵中可复验（真机探针是独立解锁条件，不在本故事 AC 内）                                                                   | ✅   |
| A3  | 目录合并与 fallback 纯函数单测                                                                           | db 覆盖 bundle、空字符串合法值、全链缺失、链去重、BCP 47 canonicalization 拒绝非法 locale                             | 合并优先级 db > bundle；共享查找函数全链缺失返回 `value: undefined`，UI `t()` 显示 key；空字符串不降级，父语言展开与链去重一致；canonicalization 后重复 locale fail-fast | ✅   |
| A4  | 两个同源 tab；数据库启用历史、工作树和分支                                                               | 分别验证 PersistedState 与非版本化实体方案：首次初始化、tab A 切语言、tab B 订阅、刷新与销毁                          | tab B 即时收到 locale；刷新保持；并发初始化收敛；切语言不进入 undo/diff/commit，切分支/restore/discard 不回退；记录不满足项与最小前置                                    | ✅   |
| A5  | A4 对照结果、US-910 的纯函数消费场景                                                                     | 冻结偏好存储、共享接口与包依赖方向                                                                                    | 保留满足合同且改动最小的方案；新增引擎能力有明确前置；无 UI、无数据库的调用方可复用同一 fallback 纯函数                                                                  | ✅   |

### 阶段 B — `@aiao/rxdb-i18n` 核心与三端绑定

| #   | 前置条件       | 操作                                                                                                                         | 预期结果                                                                                                                                                                                                                                                                                                                         | 状态 |
| --- | -------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| B1  | 阶段 A 完成    | 初始化 `@aiao/rxdb-i18n`：注册目录、使用 A 冻结的偏好存储、调用 `t()` / `formatNumber` / `formatDate` / `formatRelativeTime` | 目录合并、fallback、ICU 格式化全绿；构造期校验（非法 locale、重复 `(locale,namespace,key)`、非法 ICU 语法）fail-fast；i18n 实体经包导出的 `i18nEntities()` 在 `RxDB.init()` 前加入 `config.entities`（init 后缺失 fail-fast）；`t(key, params, namespace?)` 支持命名空间选择；不初始化数据库也能用纯静态目录的 `t()`（无库模式） | ✅   |
| B2  | 三端绑定包就位 | 调用 `useI18n()`：`{ t, locale, availableLocales, setLocale, formatNumber, formatDate, formatRelativeTime }`                 | 三端同签名同语义、`locale` / `availableLocales` 按**框架原生响应式类型**暴露（Angular `Signal` / React 状态 / Vue `Ref`），`setLocale()` 后所有订阅组件自动重渲染；组件销毁不泄漏订阅；`tri-framework-check` 通过                                                                                                                | ✅   |
| B3  | 阶段 B 交付前  | 执行 lint / typecheck / test / build / coverage、补齐 API baseline                                                           | 新包覆盖率 ≥ 80%；TSDoc 齐备；零 ESLint 警告；`api-surface.mjs --check` 收录新导出                                                                                                                                                                                                                                               | ✅   |

### 阶段 C — rxdb-model 去硬编码与三端 demo

| #   | 前置条件                      | 操作                                                                                          | 预期结果                                                                                                                                                                                                  | 状态 |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| C1  | 阶段 B 完成，盘点表（A1）就绪 | rxdb-model 四包按盘点表替换为 key；内置 zh-Hans 目录随包发布                                  | 未注册任何覆盖时，三端组件默认渲染与改前**逐字一致**（快照测试）；既有 options 参数（`actionsTitle` 等）优先级高于目录；**已打开的 DOM 编辑器在语言切换后刷新 placeholder / hint / 错误文案**（无需重开） | ✅   |
| C2  | C1 完成                       | 应用注册自有 en 目录覆盖 `rxdb-model.*` key                                                   | 覆盖生效且只影响被覆盖 key；未覆盖 key 回退 zh-Hans；重启后覆盖仍在（db 持久）                                                                                                                            | ✅   |
| C3  | 三端 demo 接入                | 加语言切换器（zh-Hans / en）；e2e：切换 → 表头/按钮/提示即时变化 → 刷新后保持 → 第二 tab 跟随 | 三端 e2e 全绿；切换全程不刷新页面；数字/日期列按 locale 格式化可见（`formatDate` 至少一处落地）                                                                                                           | ✅   |
| C4  | C1～C3 完成                   | 执行三端 parity 与全量门禁                                                                    | `tri-framework-check` 通过；rxdb-model 四包与 demo 的 affected lint / test / build / e2e 全绿                                                                                                             | ✅   |

### 阶段 D — 目录远端分发与可观测（可选后置，独立关闭）

| #   | 前置条件                                  | 操作                                                                             | 预期结果                                                                                                                       | 状态 |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---- |
| D1  | HTTP 分发链路（US-212 / US-023 / US-216） | 目录作为 QueryCache 实体从参考后端分发；远端改一条文案                           | 客户端经 changeFeed 失效上报拉到新值并即时重渲染；离线时仍渲染本地缓存版                                                       | ✅   |
| D2  | D1 完成                                   | 缺失 key 写入本地诊断实体；DevTools 面板显示当前 locale、目录来源、缺失 key 列表 | 面板逐行检视；缺失 key 不打断渲染（回退链照常），诊断行可清空                                                                  | ✅   |
| D3  | D1 完成                                   | 远端删除一条目录行                                                               | 合并按 db > remote > bundle 回退：有本地覆盖回退到 db 覆盖、否则回退到 bundle 默认值；本地覆盖行不受远端删除影响、不回退成缺失 | ✅   |

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

### 显示偏好数据合同

```text
id                      string         // 'singleton'
deviceLocale            string         // 宿主探测值
devicePreferredLocale   string | null  // 用户显式选择（字段名与 US-910 决策 5 一致）
defaultLocale           string
```

- 上表描述逻辑字段，不预定必须建 `I18nSettings` 实体。本次经 A4/A5 对照后冻结为 `I18nSettings` 实体；存储身份为当前物理本地数据库中的 `i18n.settings` 表与 `singleton` 行；逻辑 dbName 同时界定现有网关频道，不同数据库使用不同 dbName，互不共享偏好。
- 偏好不 push 到其他设备，不属于业务撤销、工作树、分支与恢复域；首次初始化必须幂等且不覆盖已经存在的用户选择。
- 选实体方案时，`SyncType.None` 与 `log` 的组合、CREATE/UPDATE 通知来源及跨 Tab 传播必须各有测试；缺能力先补前置。当前辅助实体为 `SyncType.None` + `log: false`；提交后通过已有实体事件驱动查询与网关，不修改引擎。实体另有单调递增的 `updatedAt`，用于响应式查询识别同毫秒内的变化。

### fallback 链（共享唯一契约）

```text
显式请求 locale（当前 UI 语言）→ devicePreferredLocale → deviceLocale → defaultLocale
```

- 使用 `Intl.getCanonicalLocales()` 拒绝非法 locale；链上每个节点先查精确 locale，再按 BCP 47 父语言降级（`fr-CA` → `fr`），按首次出现顺序去重。
- 纯函数接收显式请求、可选设备偏好、设备 locale 和调用方默认语言，不自行探测宿主或访问存储；设备探测与偏好适配由本故事负责。
- 缺失行与空字符串语义不同；空字符串命中后不再降级。共享查找函数无命中返回 `value: undefined`。
- UI `t()` 将无命中映射为 **key 本身**（不抛、渲染安全）；阶段 D 启用后记录缺失 key 诊断，无库模式不强制创建诊断实体。
  数据翻译侧 `resolveTranslation` 保留 `value: undefined`，不把 key 当作内容。

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

## 实现与验收记录

- A～D 均已实现，偏好载体按最新 A4/A5 合同完成对照与隔离验证。UI 包使用 `@aiao/rxdb-i18n`，locale 规范化与 fallback 链由该包单一实现，供 US-910 复用。
- A4 对照：`PersistedStateRegistry` 同 key 的两个已初始化注册表不跨实例通知，显式 StorageEvent 也不更新旧快照；新注册表可恢复盘上值。对照单文件 31 条、utils 整包 983 条及 lint/typecheck 通过。现有方案需补跨 Tab 监听与非浏览器持久后端，因此本次复用已有非版本化实体和网关，未实现第二套存储。
- A4 实体隔离：[专项测试](../../../packages/rxdb-i18n/src/preference-history-isolation.spec.ts) 3 条通过。启用 history、working-tree 与分支后，切语言不增加 undo 数、`i18n` changelog、status、diff；业务 undo/redo 仍实际生效且偏好不变，commit 只含 Note 业务行；往返分支、restore 旧 commit 和 discard 均保留新偏好。原有同库双实例、并发初始化与三端真实跨 Tab 验收继续覆盖通知边界。
- A5 接口：读取 `firstValueFrom(rxdb.entityManager.getRepository(I18nSettings).get('singleton'))` 的设备偏好字段，数据侧显式传自己的实体默认内容语言给 `buildLocaleChain()`。同一纯函数的 UI 默认 `zh-Hans` 与内容默认 `de` 解析已验证，不需要 UI、数据库初始化或另建偏好实体；依赖方向不包含框架绑定。
- 四运行时共用 `@aiao/rxdb-i18n/testing` 的 ICU 断言，Node、真实 Chromium、Electron `.app` 渲染器、Tauri release WebView 均已通过；原生验证平台为 macOS / arm64，详见[运行时证据](../../client-i18n-research.md#a2-实际运行验证)。
- 模型四包 2031 条测试通过。未配置 provider 保持原日期时间与数字输出；显式配置后日期列按 locale 格式化并保留时分秒。三端 e2e 精确验证列值、即时切换、刷新持久化与跨 Tab 跟随。
- HTTP e2e 验证单条更新、空字符串、本地覆盖优先、远端删除后物理行隔离、空远端缓存离线首屏，以及同页恢复联网和重置后继续收敛。
- DevTools 面板覆盖全部目录层、来源与缺失 key；清空只作用于诊断，并沿用既有权限和 mutationPolicy。旧 settings clear 的声明边界保持不变。
- 新四包覆盖率四项均 ≥80%；核心运行时为语句 96.38%、分支 87.06%、函数 97.59%、行 97.74%。公开 API、包图、TSDoc 与三框架对称检查通过。
- 合并最新需求合同前的实现基线已通过串行 affected 全量门禁：88 个项目、357 个任务（329 项缓存，92%），用时 11 分 27 秒。命令如下；搜索插件浏览器目标曾发生模块加载抖动，代码未改，隔离复跑通过，Nx 标记为 flaky。

```bash
NX_DAEMON=false pnpm nx affected -t lint typecheck test test-memory test-browser build audit-lazy-backend e2e --exclude=website,benchmarks --output-style=static --skipRemoteCache --parallel=1 --nxBail
```

## 实现文件

- `packages/rxdb-i18n/` — 框架无关核心：目录注册与合并、ICU 消息引擎接入、偏好存储适配与 `MessageEntry`
  schema/repository、唯一的 fallback/canonicalization 纯函数与偏好读接口、命令式 `t()`（含无库模式）
- `packages/rxdb-i18n-angular/` / `packages/rxdb-i18n-react/` / `packages/rxdb-i18n-vue/` — `useI18n()` 三端绑定
- `packages/rxdb-model/` — 内置 zh-Hans 默认目录、文案 key 迁移、翻译函数注入点与既有 options 优先级
- `packages/rxdb-model-{angular,react,vue}/` — 组件文案改用核心目录
- `apps/dev-rxdb-{angular,react,vue}/` + 对应 e2e — 语言切换器与验收
- 阶段 D：`apps/dev-rxdb-http*`（目录分发演示）、`packages/rxdb-devtools/`（检视协议与结构端口）、
  `modules/rxdb-devtools-panel/`（i18n 面板）、
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
