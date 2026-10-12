---
id: US-910
title: 数据国际化 / 本地化（多语言实体翻译）
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-10-10
updated: 2026-10-10
tags: [i18n, plugin, sync, search]
---

# 用户故事：数据国际化 / 本地化（多语言实体翻译）

## 作为/我想要/以便

**作为** 使用 `@aiao/rxdb` 构建多语言应用的开发者
**我想要** 以声明式方式给实体的人类可读字段配置翻译（`@Translatable`），翻译内容作为一等公民数据参与离线读写与多端同步，并按语言控制同步范围
**以便** 在本地优先场景下安全维护多语言内容——不同设备并发编辑互不覆盖、增加语言不改已有业务表、删除主实体不留孤儿翻译、多语言内容可按语言搜索

## 设计决策

1. **生产方案只采用 C-L：每个实体 × 每门语言一张翻译表。**
   C（单翻译表 + `locale` 列）保留为阶段 A 的研究对照，不进入阶段 B 公共 API。当前同步引擎的 Filter 只约束 pull/cleanup，不约束 push，也没有按 Filter 集合独立 watermark；把 C 作为生产方案会制造错误的“零流量”承诺。
2. **阶段 A 不修改已发布的 `Recipe`。** 新建一个语言无关主表的试点实体，现有 `Recipe.title` / `Recipe.tag` 的数据搬迁另立迁移故事。US-910 不宣称自动把已有主表字段迁移到翻译表。
3. **同步试点必须使用 Full/Filter 能力完整的同步测试夹具。** 当前 `@aiao/rxdb-adapter-http` v1 与 `dev-rxdb-http-server` 是 QueryCache/REST 示例，不承担 US-910 的 Full/Filter、离线写入或冲突验收。
4. **按语言启停就是按实体启停：只依赖现有 `RxDBSync.enabled` 与每实体水位，不引入同步 profile 机械。**
   C-L 下「语言集合变化」退化为「哪些语言实体的 `enabled` 是 true」：新增语言 = 新实体，自己的
   `lastPullRemoteChangeId` 从 0 开始全量拉；停用 = `enabled = false`；重新启用（retain）= 从自己的
   水位继续，语义天然正确；purge = 重置该实体水位（写入路径已存在）+ `cleanupExpired`。所有生成的语言
   实体都有本地主适配器；未启用语言只停止远端同步。`rxdb-plugin-sync` 无需任何改动。
5. **设备 locale、用户显示偏好、同步语言集合是三个不同概念。** 设备 locale 不同步；用户偏好默认按设备保存；`syncLocales()` 是显式的设备级同步配置。US-910 不把一个设备的语言切换广播给其他设备。
6. **翻译实体必须在 `RxDB.init()` / `SchemaManager.init()` 之前显式加入 `config.entities`。** `@Translatable` 只登记声明，`createTranslatableEntities()` 负责生成实体类；插件不得在普通 `install()` 阶段追加已错过建表时机的实体。
7. **「迟到翻译更新不复活数据」在客户端合并层解决，远端保持通用。** 确定性子行 id + pull 拓扑序
   （父先子后，[`topologicalSortForPull`](../../../packages/rxdb-plugin-sync/src/pull-batch.ts)）+
   合并期规则：**子行变更合入时父行已本地删除（tombstone 已知）→ 丢弃该变更**；父行尚未拉到
   （全量同步下因果序保证罕见）→ 整批失败回滚、水位不推进、下轮重试（现有事务语义，无需引擎改动）。
   引擎的 pull 整批单事务 + `defer_foreign_keys`（[`RxDBAdapterSqliteBase`](../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts) 事务路径）意味着不存在「远端拦截」的落点——
   这条规则只能放在客户端合并层。

## 范围边界

### In Scope

- 语言无关主实体 + 每语言翻译实体的建模与读写
- 翻译行进入 changelog，支持离线写入、Full 同步、LWW 冲突收敛
- C-L 每语言实体的同步启停、历史数据保留与重新启用后的补拉
- `@Translatable` 声明、翻译实体生成、fallback 纯函数与读取 API
- 设备 locale 探测、设备级语言偏好、默认语言 fallback 链
- 事务内级联删除、合并期孤儿丢弃、FTS 摘除与孤儿检测
- 按语言搜索翻译内容，并把搜索结果映射回主实体
- Angular / React / Vue 三端演示：翻译编辑、locale 切换、fallback 展示、语言同步启停

### Out of Scope

- UI 文案翻译（rxdb-model 组件硬编码中文，独立问题）
- 已发布实体的字段搬迁、双写兼容和回滚迁移（另立 migration story）
- C 单表作为生产同步策略；只在阶段 A 做对照实验
- 引擎内置 locale 感知排序 / 字符串比较（字节序合同，US-028 / US-030）
- regex / 大小写不敏感查询算子（SQLC-007 合同）
- 每语言一条主实体文档
- 机翻、审校工作流、多语言 tokenizer
- 主表派生镜像列；除非列表查询正确性已满足且性能预算实测超标
- 权限继承、加密字段联动；US-029 与加密故事另行定义

## 前置依赖

- 阶段 A 的同步 AC 依赖一个**薄通用 Full-sync 参考夹具**：按实体存 changelog + pull/push 端点 + LWW，
  不需要任何父子/翻译智能（US-216 的引擎参考后端模式）。建议拆为独立故事（`apps/dev-rxdb-sync-server/`），
  夹具就绪即解锁 A0/A3～A7/A12；**本地 AC（A1/A2/A8/A10/A11/A13/A14 + A9 编辑半边）不依赖夹具、可先行**。
- 主实体和翻译实体必须使用同一个本地适配器；主实体为 QueryCache 或 remote-only 时，不得启用本故事的离线翻译写入。
- 阶段 A 第一项核实：pull 合并器对「父行缺失的子行变更」的现有行为（本故事按设计决策 7 的模型推进；
  若实测与模型不符，先修正模型再动代码）。

## 验收标准

### 阶段 A — 手写试点（不改引擎）

| #   | 前置条件                                                                                    | 操作                                                          | 预期结果                                                                                                                                                                                    | 状态 |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| A0  | 薄通用 Full-sync 参考夹具（按实体存 changelog + pull/push 端点 + LWW，无父子智能）          | 初始化两个独立本地库和一个远端库                              | 不依赖 HTTP QueryCache server；能观察每个实体的 push/pull、watermark、删除事件                                                                                                              | ⬜   |
| A1  | 新建语言无关 `LocalizedRecipe` 主表；C-L 生成 `LocalizedRecipeZhHans` / `LocalizedRecipeEn` | 写入 zh-Hans / en 的标题与标签                                | 每门语言各落独立翻译表；主表没有可翻译文本；`resolveTranslation` 返回正确值                                                                                                                 | ⬜   |
| A2  | 请求链包含缺失语言、父语言和默认语言                                                        | 调用 `resolveTranslation(field, ['zh-Hans', 'zh', 'en'])`     | 返回第一个命中的非缺失值，并返回 `matchedLocale` 与 `isFallback`；缺失与空字符串语义不同；全链缺失返回 `value: undefined`，不抛错                                                           | ⬜   |
| A3  | 两台设备离线分别写 zh-Hans / en；主实体已存在                                               | 依次 push / pull                                              | 两门语言的翻译行都保留；一台设备的写入不覆盖另一门语言                                                                                                                                      | ⬜   |
| A4  | 两台设备离线创建同一 `(entityId, fieldName, locale)` 翻译行                                 | pull                                                          | 两端使用同一确定性主键；按现有 LWW 规则收敛为一行；不撞唯一约束、不产生重复行                                                                                                               | ⬜   |
| A5  | 远端存在 zh-Hans / en / fr，设备 A 只启用 zh-Hans，设备 B 持有三门语言                      | 设备 A 删除主实体，双方同步                                   | 设备 A 在一个本地事务内删主行 + 全部翻译行，按拓扑序 push（子先父后，现有 `requiredBy` 相位）；设备 B 最终无孤儿行；**迟到翻译更新在合并期被丢弃**（父行已删）不复活数据；本地 FTS 不再命中 | ⬜   |
| A6  | 设备 A 只启用 zh-Hans，en 表有远端历史数据                                                  | 先同步 zh-Hans，再切换启用 en                                 | 新启用的 en 实体从自己的水位 0 开始全量拉历史数据；无需任何 profile/基线机械，不改 sync plugin                                                                                              | ⬜   |
| A7  | en 表曾经同步过，现被停用                                                                   | 切换语言并执行同步                                            | 停用只停止远端同步；retain：本地数据保留、重新启用从原水位继续；purge：重置该实体水位 + 本地清理，不生成用户 DELETE changelog，重新启用全量补拉                                             | ⬜   |
| A8  | 翻译实体 `value` 标记 searchable                                                            | 在 zh-Hans collection 搜索中文词，在 en collection 搜索英文词 | 搜索只命中目标语言；结果包含主实体 id、语言、字段和 snippet；删除后不再命中                                                                                                                 | ⬜   |
| A9  | Angular / React / Vue 三端 demo                                                             | 打开翻译编辑、切换 locale、观察 fallback                      | 三端都有同一核心输入输出契约：编辑翻译、显示命中语言、显示 fallback 状态；至少一端连接同步夹具展示启停和补拉                                                                                | ⬜   |
| A10 | 任意 string 主实体 id、字段名、locale 边界值                                                | 运行确定性 id 与表名生成测试                                  | 编码无碰撞；locale canonicalization、表名碰撞、保留字、长度边界均 fail-fast 或有明确映射                                                                                                    | ⬜   |
| A11 | 多个 fieldName、缺失默认语言、多个 locale 表                                                | 按 fallback 结果列表查询、排序、分页                          | 主实体不重复；缺失翻译不会丢行；排序与分页稳定；记录查询计划和性能数据                                                                                                                      | ⬜   |
| A12 | 阶段 A 用例完成                                                                             | 评审 C 对照结果                                               | 研究报告记录 C 的 push、watermark、搜索过滤限制；C 不得被描述为与 C-L 具有相同的部分同步保证                                                                                                | ⬜   |
| A13 | pull 批内同时含父 DELETE 与迟到的子 UPDATE/INSERT                                           | 合入变更                                                      | 子行变更在合并期被丢弃（父行已本地删除）；不复活数据、不因 FK 违规卡死水位；全量同步下「父行尚未拉到」场景整批回滚、下轮重试（不丢数据）                                                    | ⬜   |
| A14 | 生成 100 个翻译实体（模拟 E×L 实体量）                                                      | 度量 init / connect / 首次搜索耗时                            | 记录数据并在研究文档给出预算判定；超预算才考虑多态单语言表变体（见研究文档方案空间），预算达标则 E×L 定案                                                                                   | ⬜   |

### 阶段 B — `@aiao/rxdb-plugin-i18n`（三端对称）

| #   | 前置条件                                                                                    | 操作                                                                                   | 预期结果                                                                                                                                                                                    | 状态 |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| B1  | `@Translatable({ fields, locales, defaultLocale })` 加在已由 `@Entity` 装饰的语言无关实体上 | 调用 `createTranslatableEntities()`，再把返回实体加入 `config.entities` 后初始化数据库 | 所有翻译实体在 `SchemaManager.init()` 前注册；新库和已有库都能补建缺失翻译表；不会在 `connect()` 后动态追加实体；装饰器顺序有回归测试                                                       | ⬜   |
| B2  | `fields` 只允许 `string` / `enum` / 明确支持的 nullable string                              | 初始化和写入                                                                           | 不支持的 `json`、`keyValue`、未定义数组表示在构造期 fail-fast；locale 使用 string，不使用会阻碍加语言的 enum                                                                                | ⬜   |
| B3  | 每个 locale 生成一个 Full-sync 翻译实体                                                     | 停用/启用某 locale                                                                     | 通过 `RxDBSync.enabled` 控制远端同步，不改运行时 entity sync 配置；停用实体仍有本地主适配器，可参与事务删除；新启用语言从自己水位 0 全量拉、retain 重启用从原水位继续、purge 重启用重置水位 | ⬜   |
| B4  | 主实体配置了 i18n repository                                                                | 删除主实体或批量删除                                                                   | repository 在一个本地事务内先显式删除全部翻译行，再删除主行；所有用户可见删除进入 changelog；未走 i18n 删除路径时 fail-fast，不允许静默留下孤儿                                             | ⬜   |
| B5  | 远端为薄通用 Full-sync 服务（无父子智能）                                                   | push/pull 删除                                                                         | 父实体删除后迟到的翻译变更在客户端合并期被丢弃（父行 tombstone 已知）；远端不需要产生级联 tombstone 或拦截语义；其他设备最终收敛                                                            | ⬜   |
| B6  | 多语言数据已就绪                                                                            | 调用 `resolveTranslation` / `findLocalized`                                            | 纯函数和 repository API 使用同一 fallback 契约，返回命中 locale、是否 fallback 和主实体关联                                                                                                 | ⬜   |
| B7  | 三端绑定包                                                                                  | 调用 Angular / React / Vue 绑定                                                        | 三端对外导出同名核心类型、同一输入输出语义；框架层只负责响应式生命周期，`tri-framework-check` 通过                                                                                          | ⬜   |
| B8  | 搜索插件已安装且生成实体已提前注册                                                          | 调用 `searchLocalized`                                                                 | 复用现有 collection scope；结果映射到主实体 id；C-L 不需要新增 locale where；SQLite FTS5 / PGlite 搜索能力按 US-702 / US-703 的适配器矩阵验收                                               | ⬜   |
| B9  | 交付前                                                                                      | 执行 lint / typecheck / test / build / coverage                                        | 新增包和 recipes-domain 覆盖率 ≥ 80%；核心 `rxdb` 改动按核心 ≥ 90% 门禁；三端 parity、TSDoc、零 ESLint 警告                                                                                 | ⬜   |

## 数据与 API 契约

### 生成翻译实体

每个翻译实体是一门语言的一张表，实体名和表名由稳定的 locale 编码派生。表结构至少包含：

```text
id          string primary key
parentId    与主实体 id 同类型，非空外键
fieldName   string
value       string
createdAt   date
updatedAt   date
```

- `id` 使用长度前缀或等价的可证明无碰撞 tuple 编码，禁止直接用未转义的 `:` 拼接。
- `(parentId, fieldName)` 是 C-L 的自然唯一键；必须有查询索引。
- 每个翻译实体声明 `parentId -> parent` 的 `MANY_TO_ONE` 关系和 `onDelete: CASCADE`，但 DB cascade 只作兜底，不替代显式 changelog 删除。
- `fieldName` 必须来自 `fields` 白名单；`locales` 必须唯一、经过 BCP 47 canonicalization，且 `defaultLocale` 必须在其中。

### Locale 与 fallback

- 规范化使用 `Intl.getCanonicalLocales()`；不接受无法 canonicalize 的 locale。
- 默认 fallback 顺序为：显式请求 locale → 用户显式设备偏好 → 设备 locale → `defaultLocale`。
- `resolveTranslation()` 返回 `{ value, matchedLocale, requestedLocale, isFallback }`；无命中返回 `value: undefined`。
- 空字符串是已存在的翻译值，不等价于缺失行。
- `deviceLocale` 和设备偏好默认 local-only；US-910 不同步一个设备的 locale 到其他设备。

### 同步启停与合并期孤儿规则

`syncLocales()` 返回设备明确允许同步的 locale 集合，不能从搜索结果或当前 fallback 值隐式推导。
C-L 下它的全部实现就是各语言实体的 `RxDBSync.enabled` 开关，**没有 profile key、没有独立 watermark API、
不改 sync plugin**：

1. 新增语言：新实体，水位从 0 开始全量拉；
2. 停用：`enabled = false`，只停止远端同步；
3. 重新启用（retain）：从该实体自己的水位继续，语义天然正确；
4. 重新启用（purge）：重置该实体水位（`lastPullRemoteChangeId` 置 null 的写入路径已存在）+
   `cleanupExpired`，再全量补拉；purge 不产生用户 DELETE changelog；
5. 记录失败，不得把“没有本地行”伪装成同步成功。

合并期孤儿规则（设计决策 7）：

- pull 按依赖图拓扑序合入（父先子后）；
- 子行变更合入时父行已本地删除 → **丢弃该变更**（写入诊断计数，不写本地 changelog）；
- 父行尚未拉到 → 整批失败回滚、水位不推进、下轮重试（引擎现有事务语义）；
- 远端不承担任何父子感知，参考夹具保持通用。

## 实现文件

- `modules/recipes-domain/` — 阶段 A 的语言无关试点实体、翻译实体工厂、resolve 纯函数、合并期孤儿规则和 schema 单测
- `packages/rxdb-plugin-i18n/` — `@Translatable` metadata、`createTranslatableEntities()`、i18n repository、fallback 与搜索映射、合并期孤儿规则
- `packages/rxdb-plugin-i18n-{angular,react,vue}/` — 三端响应式绑定，导出同一核心契约
- `packages/rxdb-model/` — 翻译编辑列/表单能力；框架包只做渲染适配
- `packages/rxdb-plugin-sync/` — 默认零改动；仅当 A13 核实结果要求合并层钩子时新增最小扩展点
- `apps/dev-rxdb-sync-server/` — 薄通用 Full-sync 参考夹具（按实体存 changelog + pull/push 端点 + LWW，无父子智能）；建议拆为独立故事先行交付；不修改 `dev-rxdb-http-server` 的 QueryCache 合同
- `apps/dev-rxdb-{angular,react,vue}/` + 对应 e2e — 三端翻译编辑、fallback、启停和补拉演示

## References

- [数据国际化 / 本地化研究](../../data-i18n-research.md)
- [US-702 全文搜索](./US-702-full-text-search.md)
- [US-703 PGlite 全文搜索](./US-703-pglite-full-text-search.md)
- [US-028 可排序实体](../core/US-028-sortable-entity.md)
- [US-030 声明式存储约束](../core/US-030-declarative-storage-constraints.md)
- [Epic: 未来功能](../../epics/epic-004-future-features.md)
- [vision.md 阶段 6](../../vision.md)
