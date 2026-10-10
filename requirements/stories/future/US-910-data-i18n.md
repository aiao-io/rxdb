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
**我想要** 以声明式方式给实体的人类可读字段配置翻译（`@Translatable`），翻译内容作为一等公民数据参与离线读写与多端同步，并可按语言只同步需要的部分
**以便** 在本地优先场景下安全地维护多语言内容——多设备不同语言并发编辑互不覆盖、加语言零迁移、删除主实体不留孤儿翻译、多语言内容可全文搜索

## 范围边界

### In Scope

- 实体可翻译字段的多语言存储（主表只留语言无关字段，全部可翻译文本进翻译表）
- 翻译内容的同步：离线可写、进 changelog、push/pull、冲突解决
- 按语言的部分同步（只同步某张表 / Filter 按 locale 过滤）
- 声明式插件 `@aiao/rxdb-plugin-i18n`（`@Translatable` 生成翻译实体与读 API）
- 语言协商与偏好（设备 locale → 用户偏好实体 → 默认语言 fallback 链）
- 删除级联（删主实体 → 翻译行本地/远端/FTS 全消失）
- 多语言内容全文搜索（FTS5，按语言检索）
- Angular / React / Vue 三端演示（翻译编辑、locale 切换、fallback 展示、只同步某语言）

### Out of Scope

- UI 文案翻译（rxdb-model 组件硬编码中文，独立问题，另行立项）
- 引擎内置 locale 感知排序 / 字符串比较（字节序合同，US-028 / US-030 决策）
- regex / 大小写不敏感查询算子（SQLC-007 合同）
- 每语言一条主实体文档（破坏实体身份，排除）
- 机翻 / 审校工作流（valid/invalid 标记），无真实使用方前不做
- vision 阶段 6 的多语言 tokenizer（jieba/ICU 分词，独立于本故事）
- 主表派生镜像列（默认语言排序优化）——阶段 A 性能 sanity 超预算时才评估

## 验收标准

### 阶段 A — 手写试点（零引擎改动，recipes-domain + 三端 demo）

| #   | 前置条件                       | 操作                                       | 预期结果                                                                                             | 状态 |
| --- | ------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---- |
| A1  | 两种表粒度都搭：每语言表（`RecipeTranslationsZhHans/En`）与单表变体（`RecipeTranslation` + locale 列） | 为 Recipe 写入 zh / en 标题与标签 | 翻译分别落行，`resolve` 按协商链返回正确语言                                                        | ⬜   |
| A2  | 请求语言的行缺失               | `resolve(field, ['zh-Hans', 'en'])`        | 返回 fallback 链第一个命中值；全链缺失按约定返回（默认语言/空），不报错；纯函数有单测               | ⬜   |
| A3  | 两台不同 locale 设备离线各写 zh / en 翻译 | 依次 push / pull                     | 两行都保留，无一方被覆盖（内嵌方案必挂的用例）                                                       | ⬜   |
| A4  | 两台设备离线创建**同一**逻辑行（同 entity + field + locale） | pull                  | 收敛为一行（LWW），不撞唯一约束、不产生重复行（行 id 确定性派生，见技术笔记）                        | ⬜   |
| A5  | 存在翻译行的 Recipe            | 删除 Recipe                                 | 本地与远端翻译行全部消失；FTS 不再命中已删实体的翻译；端到端不留孤儿行                               | ⬜   |
| A6  | zh 设备，C-L 下 en/fr 表 `SyncDisabled`、C 下 Filter 闭包 | 同步                    | 未启用语言零流量零行；启用后正常拉取                                                                  | ⬜   |
| A7  | 已同步某语言的翻译             | 语言偏好切换                               | 旧语言数据保留（C-L）/按策略清理（C），行为与决策记录一致并留测试                                    | ⬜   |
| A8  | 翻译 value 标注 searchable     | FTS 检索中文/英文词                        | 按语言检索命中对应翻译；C 变体按 locale 过滤                                                          | ⬜   |
| A9  | Angular / React / Vue 三端 demo | 打开翻译编辑入口、切换 locale、观察 fallback | 三端均有翻译编辑 + locale 切换 + fallback 展示；至少一端演示「只同步某语言」与「切语言后旧语言数据保留」（单端缺失 = 未完成） | ⬜   |
| A10 | A1～A9 同一组用例在两种表粒度下都跑过 | 汇总实测证据             | 对「每语言表 vs 单表」拍板并写回[研究报告](../../data-i18n-research.md)决策记录（同步语义、FTS、切语言行为、观测面） | ⬜   |
| A11 | 列表页数据量正常规模           | 按默认语言 join 排序、查询翻译             | 性能 sanity 记录在案；超预算再评估 Out of Scope 的派生镜像列                                         | ⬜   |

### 阶段 B — `@aiao/rxdb-plugin-i18n` 插件（三端对称）

| #   | 前置条件                   | 操作                                     | 预期结果                                                                                 | 状态 |
| --- | -------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- | ---- |
| B1  | 实体声明 `@Translatable({ fields, locales, defaultLocale, strategy })` | 初始化数据库（新库与已发布库） | 翻译实体自动生成、注册并建表（走 `#ensureEntityTables` 补建缺失表，新旧库同路径，零迁移） | ⬜   |
| B2  | 同上                       | 写入翻译                                 | 行 id 由 (entityId, fieldName[, locale]) 确定性派生，主键即自然键；`fieldName` ∉ `fields` 构造期 fail-fast | ⬜   |
| B3  | `syncLocales()` 返回本设备语言集 | 同步                               | C-L：需要语言 `Full`、其余 `SyncDisabled`；C：Filter 闭包 `locale in syncLocales()`；偏好变更驱动重配 | ⬜   |
| B4  | 存在翻译行的主实体         | 通过插件删除主实体                       | 事务内先显式删翻译行再删主行 + 关系 `onDelete: OnDeleteAction.CASCADE` 兜底；changelog 完整、FTS 摘除、远端无孤儿 | ⬜   |
| B5  | 多语言数据就绪             | 调用 `resolveTranslation` / `findLocalized` | fallback 链语义与阶段 A 单测一致，纯函数可独立测试                                          | ⬜   |
| B6  | 三端绑定包                 | `useTranslation` 之类 API 三端对称       | `rxdb-plugin-i18n-angular/react/vue` 同功能同 API，`tri-framework-check` 通过              | ⬜   |
| B7  | rxdb-model 翻译编辑组件    | 三端 entity-table/form 挂载              | 同一实现三端共用（沿 `buildEditableColumns` 架构），编辑翻译 + fallback 指示               | ⬜   |
| B8  | 交付前                     | lint / test / build / coverage           | TDD 红绿、插件包覆盖率 ≥ 80%、TSDoc 齐全、零 ESLint 警告                                  | ⬜   |

## 技术笔记

方案全貌与逐条论据见 [data-i18n-research.md](../../data-i18n-research.md)，要点：

- **翻译表家族，主表只留语言无关字段**。表粒度（每语言一张表 C-L vs 单表 + locale 列 C）暂缓定案，阶段 A 实测后拍板（A10）；插件两种 `strategy` 都生成，决策只改默认值。
- **行 id 确定性派生**（C-L：`${recipeId}:${fieldName}`；C：`${recipeId}:${fieldName}:${locale}`，客户端提供 string id，`Recipe` 覆盖 uuid 为 string 的既有先例）——离线并发创建同一逻辑行得到同一 id，同步时按同一行 LWW 收敛，不撞唯一约束、不产生重复行（研究报告第 10 节 P0 修复）。
- **同步冲突**：引擎只有整实体 LWW（`LWWConflictResolver`，`createdAt` → `clientId` → 本地优先），无字段级合并；翻译行把冲突隔离到行级，默认解决器即正确。
- **部分同步**：`SyncType.Filter` 的 `remote.filter: () => RuleGroup` 运行时求值、「拉取与过期清理都按 filter 取子集」（`cleanup-expired.ts`）；C-L 用按实体 sync（`Full` / `SyncDisabled`）实现「只同步某张表」。实例级覆盖是构造时固化的 `ReadonlyMap`，C-L 的「偏好变更 → 重配」深度是 A 阶段对比验收维度之一。
- **删除级联**：关系 `onDelete: OnDeleteAction.CASCADE`（DDL 原生，多对多中间表先例 `many-to-many-entity.ts:90,102`）作兜底；主路径是插件把删除包装成事务内「先显式删翻译行、再删主行」——`recursive_triggers` 全仓未开启，FK 级联删除不进 changelog，显式删除同时保证同步完整与 FTS 摘除（搜索插件靠引擎变更事件维护 FTS5）。
- **搜索**：`searchable` 白名单只收 `string/enum/stringArray`（`rxdb-plugin-search/plugin.ts:546`），翻译行 `value` 是 string 可进 FTS5；C-L 天然按语言分表检索，C 按 locale 过滤。vision 阶段 6 的多语言 tokenizer 消费本故事产出的多语言内容，排期在其后。
- **语言偏好**：入 RxDB 设置实体（可同步、多端一致）；协商链 = 设备探测（browser locale，electron `resolveLocaleId` 先例）→ 用户偏好 → 默认语言。
- **不碰引擎合同**：不加 per-entity schema 迁移、不加 locale 排序（字节序）、不加 regex/大小写不敏感算子；阶段 B 插件全部基于引擎现状能力。

## 实现文件

- `modules/recipes-domain/` — 阶段 A 试点：翻译表实体（两种表粒度）、`resolve` 纯函数、schema 漂移单测（`recipe-schema.spec.ts` 模式）
- `apps/dev-rxdb-{angular,react,vue}/` + 对应 e2e — 阶段 A 三端演示（翻译编辑、locale 切换、fallback、双 locale 双上下文 e2e）
- `apps/dev-rxdb-http-server/` — 阶段 A：远端注册翻译表、支持翻译实体同步端点
- `packages/rxdb-plugin-i18n/` — 阶段 B：`@Translatable` 声明、翻译实体生成、同步装配、级联删除封装、`resolveTranslation` / `findLocalized`
- `packages/rxdb-plugin-i18n-{angular,react,vue}/` — 阶段 B：三端绑定（对称导出）
- `packages/rxdb-model/` — 阶段 B：翻译编辑组件（三端共用）

## References

- [数据国际化 / 本地化研究（含决策记录与评审结论）](../../data-i18n-research.md)
- [US-702 全文搜索](./US-702-full-text-search.md)
- [US-028 可排序实体](../core/US-028-sortable-entity.md)（字节序排序合同）
- [Epic: 未来功能](../../epics/epic-004-future-features.md)
- [vision.md 阶段 6（多语言 tokenizer）](../../vision.md)
