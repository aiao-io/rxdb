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
4. **按语言启停使用现有 `RxDBSync.enabled`，不运行时改写实体同步配置。** 所有生成的语言实体都有本地主适配器；未启用语言只停止远端同步，已落地的本地数据按保留策略处理。这样事务内删除不会遇到没有主适配器的 `SyncDisabled` 实体。
5. **设备 locale、用户显示偏好、同步语言集合是三个不同概念。** 设备 locale 不同步；用户偏好默认按设备保存；`syncLocales()` 是显式的设备级同步配置。US-910 不把一个设备的语言切换广播给其他设备。
6. **翻译实体必须在 `RxDB.init()` / `SchemaManager.init()` 之前显式加入 `config.entities`。** `@Translatable` 只登记声明，`createTranslatableEntities()` 负责生成实体类；插件不得在普通 `install()` 阶段追加已错过建表时机的实体。

## 范围边界

### In Scope

- 语言无关主实体 + 每语言翻译实体的建模与读写
- 翻译行进入 changelog，支持离线写入、Full 同步、LWW 冲突收敛
- C-L 每语言实体的同步启停、历史数据保留与重新启用后的补拉
- `@Translatable` 声明、翻译实体生成、fallback 纯函数与读取 API
- 设备 locale 探测、设备级语言偏好、默认语言 fallback 链
- 事务内级联删除、远端 tombstone、FTS 摘除与孤儿检测
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

- `@aiao/rxdb-plugin-sync` 的 Full/Filter 同步测试夹具必须能驱动两个独立本地库、远端 changelog、push/pull、删除 tombstone 和冲突结果。
- 若需要浏览器双上下文演示，新增 `apps/dev-rxdb-sync-server/` 或等价的同步能力完整服务；不得复用只支持 QueryCache 的 `apps/dev-rxdb-http-server/`。
- 主实体和翻译实体必须使用同一个本地适配器；主实体为 QueryCache 或 remote-only 时，不得启用本故事的离线翻译写入。

## 验收标准

### 阶段 A — 手写试点（不改引擎）

| #   | 前置条件                                                                                    | 操作                                                          | 预期结果                                                                                                                               | 状态 |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| A0  | 同步夹具支持 Full、`RxDBSync.enabled`、push/pull、删除 tombstone                            | 初始化两个独立本地库和一个远端库                              | 不依赖 HTTP QueryCache server；能观察每个实体的 push/pull、watermark、删除事件                                                         | ⬜   |
| A1  | 新建语言无关 `LocalizedRecipe` 主表；C-L 生成 `LocalizedRecipeZhHans` / `LocalizedRecipeEn` | 写入 zh-Hans / en 的标题与标签                                | 每门语言各落独立翻译表；主表没有可翻译文本；`resolveTranslation` 返回正确值                                                            | ⬜   |
| A2  | 请求链包含缺失语言、父语言和默认语言                                                        | 调用 `resolveTranslation(field, ['zh-Hans', 'zh', 'en'])`     | 返回第一个命中的非缺失值，并返回 `matchedLocale` 与 `isFallback`；缺失与空字符串语义不同；全链缺失返回 `value: undefined`，不抛错      | ⬜   |
| A3  | 两台设备离线分别写 zh-Hans / en；主实体已存在                                               | 依次 push / pull                                              | 两门语言的翻译行都保留；一台设备的写入不覆盖另一门语言                                                                                 | ⬜   |
| A4  | 两台设备离线创建同一 `(entityId, fieldName, locale)` 翻译行                                 | pull                                                          | 两端使用同一确定性主键；按现有 LWW 规则收敛为一行；不撞唯一约束、不产生重复行                                                          | ⬜   |
| A5  | 远端存在 zh-Hans / en / fr，设备 A 只启用 zh-Hans，设备 B 持有三门语言                      | 设备 A 删除主实体，双方同步                                   | 远端原子删除主行及全部翻译行，并为每条被删除翻译产生可同步 tombstone；设备 B 最终无孤儿行；迟到翻译更新不会复活数据；本地 FTS 不再命中 | ⬜   |
| A6  | 设备 A 只启用 zh-Hans，en 表有远端历史数据                                                  | 先同步 zh-Hans，再切换启用 en                                 | 启用集合变化触发新的同步 profile：清理策略先执行，en 从基线/独立 watermark 补拉历史数据；不能只从旧全局 watermark 继续拉               | ⬜   |
| A7  | en 表曾经同步过，现被停用                                                                   | 切换语言并执行同步                                            | 停用只停止远端同步；本地数据按明确的 `retain` / `purge` 策略处理；purge 不生成用户 DELETE changelog；重新启用后能按策略恢复            | ⬜   |
| A8  | 翻译实体 `value` 标记 searchable                                                            | 在 zh-Hans collection 搜索中文词，在 en collection 搜索英文词 | 搜索只命中目标语言；结果包含主实体 id、语言、字段和 snippet；删除后不再命中                                                            | ⬜   |
| A9  | Angular / React / Vue 三端 demo                                                             | 打开翻译编辑、切换 locale、观察 fallback                      | 三端都有同一核心输入输出契约：编辑翻译、显示命中语言、显示 fallback 状态；至少一端连接同步夹具展示启停和补拉                           | ⬜   |
| A10 | 任意 string 主实体 id、字段名、locale 边界值                                                | 运行确定性 id 与表名生成测试                                  | 编码无碰撞；locale canonicalization、表名碰撞、保留字、长度边界均 fail-fast 或有明确映射                                               | ⬜   |
| A11 | 多个 fieldName、缺失默认语言、多个 locale 表                                                | 按 fallback 结果列表查询、排序、分页                          | 主实体不重复；缺失翻译不会丢行；排序与分页稳定；记录查询计划和性能数据                                                                 | ⬜   |
| A12 | 阶段 A 用例完成                                                                             | 评审 C 对照结果                                               | 研究报告记录 C 的 push、watermark、搜索过滤限制；C 不得被描述为与 C-L 具有相同的部分同步保证                                           | ⬜   |

### 阶段 B — `@aiao/rxdb-plugin-i18n`（三端对称）

| #   | 前置条件                                                                                    | 操作                                                                                   | 预期结果                                                                                                                                        | 状态 |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| B1  | `@Translatable({ fields, locales, defaultLocale })` 加在已由 `@Entity` 装饰的语言无关实体上 | 调用 `createTranslatableEntities()`，再把返回实体加入 `config.entities` 后初始化数据库 | 所有翻译实体在 `SchemaManager.init()` 前注册；新库和已有库都能补建缺失翻译表；不会在 `connect()` 后动态追加实体；装饰器顺序有回归测试           | ⬜   |
| B2  | `fields` 只允许 `string` / `enum` / 明确支持的 nullable string                              | 初始化和写入                                                                           | 不支持的 `json`、`keyValue`、未定义数组表示在构造期 fail-fast；locale 使用 string，不使用会阻碍加语言的 enum                                    | ⬜   |
| B3  | 每个 locale 生成一个 Full-sync 翻译实体                                                     | 停用/启用某 locale                                                                     | 通过 `RxDBSync.enabled` 控制远端同步，不改运行时 entity sync 配置；停用实体仍有本地主适配器，可参与事务删除；启用后按同步 profile 补拉历史数据  | ⬜   |
| B4  | 主实体配置了 i18n repository                                                                | 删除主实体或批量删除                                                                   | repository 在一个本地事务内先显式删除全部翻译行，再删除主行；所有用户可见删除进入 changelog；未走 i18n 删除路径时 fail-fast，不允许静默留下孤儿 | ⬜   |
| B5  | 远端同步服务支持父子删除 tombstone                                                          | push/pull 删除                                                                         | 远端级联删除对子行可见；父实体删除后迟到的翻译变更被 tombstone 拦截；其他设备最终收敛                                                           | ⬜   |
| B6  | 多语言数据已就绪                                                                            | 调用 `resolveTranslation` / `findLocalized`                                            | 纯函数和 repository API 使用同一 fallback 契约，返回命中 locale、是否 fallback 和主实体关联                                                     | ⬜   |
| B7  | 三端绑定包                                                                                  | 调用 Angular / React / Vue 绑定                                                        | 三端对外导出同名核心类型、同一输入输出语义；框架层只负责响应式生命周期，`tri-framework-check` 通过                                              | ⬜   |
| B8  | 搜索插件已安装且生成实体已提前注册                                                          | 调用 `searchLocalized`                                                                 | 复用现有 collection scope；结果映射到主实体 id；C-L 不需要新增 locale where；SQLite FTS5 / PGlite 搜索能力按 US-702 / US-703 的适配器矩阵验收   | ⬜   |
| B9  | 交付前                                                                                      | 执行 lint / typecheck / test / build / coverage                                        | 新增包和 recipes-domain 覆盖率 ≥ 80%；核心 `rxdb` 改动按核心 ≥ 90% 门禁；三端 parity、TSDoc、零 ESLint 警告                                     | ⬜   |

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

### 同步 profile

`syncLocales()` 返回设备明确允许同步的 locale 集合，不能从搜索结果或当前 fallback 值隐式推导。profile 变化必须：

1. 生成新的 profile key；
2. 对停用 locale 执行明确的 retain/purge 策略；
3. 为启用 locale 使用独立 watermark 或从基线重新拉取；
4. 等待重配完成后才向 UI 报告新语言可用；
5. 记录失败，不得把“没有本地行”伪装成同步成功。

## 实现文件

- `modules/recipes-domain/` — 阶段 A 的语言无关试点实体、翻译实体工厂、resolve 纯函数和 schema 单测
- `packages/rxdb-plugin-i18n/` — `@Translatable` metadata、`createTranslatableEntities()`、i18n repository、fallback 与搜索映射
- `packages/rxdb-plugin-i18n-{angular,react,vue}/` — 三端响应式绑定，导出同一核心契约
- `packages/rxdb-model/` — 翻译编辑列/表单能力；框架包只做渲染适配
- `packages/rxdb-plugin-sync/` — 仅在需要暴露 profile reset / 独立 watermark 时新增最小公共能力
- `apps/dev-rxdb-sync-server/` — 阶段 A 的 Full/Filter/tombstone 同步夹具；不修改 `dev-rxdb-http-server` 的 QueryCache 合同
- `apps/dev-rxdb-{angular,react,vue}/` + 对应 e2e — 三端翻译编辑、fallback、启停和补拉演示

## References

- [数据国际化 / 本地化研究](../../data-i18n-research.md)
- [US-702 全文搜索](./US-702-full-text-search.md)
- [US-703 PGlite 全文搜索](./US-703-pglite-full-text-search.md)
- [US-028 可排序实体](../core/US-028-sortable-entity.md)
- [US-030 声明式存储约束](../core/US-030-declarative-storage-constraints.md)
- [Epic: 未来功能](../../epics/epic-004-future-features.md)
- [vision.md 阶段 6](../../vision.md)
