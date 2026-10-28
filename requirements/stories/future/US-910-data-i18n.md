---
id: US-910
title: 数据国际化 / 本地化（多语言实体翻译）
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-10-10
updated: 2026-10-28
tags: [i18n, plugin, sync, search]
---

# 用户故事：数据国际化 / 本地化（多语言实体翻译）

## 作为/我想要/以便

**作为** 使用 `@aiao/rxdb` 构建多语言应用的开发者
**我想要** 以声明式方式给实体的人类可读字段配置翻译（`@Translatable`），翻译内容作为一等公民数据参与离线读写与多端同步，并按语言控制同步范围
**以便** 在本地优先场景下安全维护多语言内容——不同设备并发编辑互不覆盖、增加语言不改已有业务表、删除主实体不留孤儿翻译、多语言内容可按语言搜索

当前为 Backlog，尚无具名使用方；同步方案的关键前提需由阶段 0 证明。本次整理不构成立项或开工授权。

## 设计决策

1. **生产方案只采用 C-L：每个实体 × 每门语言一张翻译表。**
   C（单翻译表 + `locale` 列）保留为阶段 A 的研究对照，不进入阶段 B 公共 API。当前同步引擎的 Filter 只约束 pull/cleanup，不约束 push，也没有按 Filter 集合独立 watermark；把 C 作为生产方案会制造错误的“零流量”承诺。
2. **阶段 A 不修改已发布的 `Recipe`。** 新建一个语言无关主表的试点实体，现有 `Recipe.title` / `Recipe.tag` 的数据搬迁另立迁移故事。US-910 不宣称自动把已有主表字段迁移到翻译表。
3. **同步试点必须使用 Full/Filter 能力完整的同步测试夹具。** 当前 `@aiao/rxdb-adapter-http` v1 与 `dev-rxdb-http-server` 是 QueryCache/REST 示例，不承担 US-910 的 Full/Filter、离线写入或冲突验收。
4. **按语言启停的目标是按实体隔离，但公开控制入口尚待验证。** `RxDBSync.enabled` 与每实体水位是内部状态，
   [`RxDBSync`](../../../packages/rxdb/src/system/sync.ts) 的写权限为系统专用；应用和普通插件不能据此假定可直接开关或重置。
   阶段 0 必须证明受支持的启停、retain、purge 入口及与在途同步的事务边界；若缺入口，先登记最小引擎需求并评审，
   再启动依赖它的同步 AC。所有语言实体仍有本地适配器，不启用语言同步不等于删除本地实体。
5. **共享 locale 算法与显示偏好接口由 US-911 定义。** 本故事只消费规范化结果、显示偏好与 fallback 候选链，
   不另建设备探测、偏好实体或同名算法；语言同步集合是本故事独立的设备级配置，不从显示 locale 推导。
6. **翻译实体必须在 `RxDB.init()` / `SchemaManager.init()` 之前显式加入 `config.entities`。** `@Translatable` 只登记声明，`createTranslatableEntities()` 负责生成实体类；插件不得在普通 `install()` 阶段追加已错过建表时机的实体。
7. **删除与迟到子行的规则须先有可复验的删除证据和扩展点。** [`pullBatchOnce`](../../../packages/rxdb-plugin-sync/src/pull-batch.ts)
   用 `mergeChanges(applyActions, undefined, true)` 合入远端变更，不为远端 DELETE 生成本地 changelog；
   不能用“查不到父行”或“本地日志没有父行”区分父行已删与父行尚未拉到。阶段 0 先确定删除证据的存储、保留期与恢复行为，
   以及应用子行前的可用扩展点。目标是已确认删除时丢弃迟到翻译，父行尚未到达时允许后续补齐；
   不得通过无限重试让该语言水位永久停住。客户端与服务端各承担什么，由验证结果裁决，不预设零引擎改动。

## 范围边界

### In Scope

- 语言无关主实体 + 每语言翻译实体的建模与读写
- 翻译行进入 changelog，支持离线写入、Full 同步、LWW 冲突收敛
- C-L 每语言实体的同步启停、历史数据保留与重新启用后的补拉
- `@Translatable` 声明、翻译实体生成与读取 API；消费 US-911 唯一的 locale/fallback 纯函数与显示偏好接口
- 独立的设备级语言同步集合、实体级默认内容语言及缺失翻译规则
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

## 交付阶段

| 阶段 | 交付                                         | 前置                       | 关闭条件                                                 | 状态 |
| ---- | -------------------------------------------- | -------------------------- | -------------------------------------------------------- | ---- |
| 0    | 同步启停、删除证据与合并扩展点的最小能力验证 | 立项授权                   | S1～S3；缺失能力有明确归属，验证不足不得宣称同步设计可行 | ⬜   |
| A    | 手写多语言实体试点                           | 阶段 0；共享 locale 契约   | A0～A14                                                  | ⬜   |
| B    | 插件与三端绑定                               | 阶段 A、所需引擎前置已交付 | B1～B9                                                   | ⬜   |

## 前置依赖

- 优先复用仓库已有的 Supabase Full-sync 测试栈，验证双库同步、watermark 与删除；HTTP QueryCache 示例不承担这些 AC。
  必须新增独立服务时先登记交付故事和范围，不把“需要新夹具”作为尚未核实的既成阻塞。
- 同步 AC 依赖阶段 0 的公开控制入口、删除证据与合并扩展点；本地建模、查询和显示实验可以独立验证，不能据此关闭同步 AC。
- 主实体和翻译实体必须使用同一个本地适配器；主实体为 QueryCache 或 remote-only 时，不得启用本故事的离线翻译写入。
- 共享 locale 规范化、fallback 与显示偏好消费接口按 [US-911](US-911-client-i18n.md) 关闭；纯函数接受调用方提供的默认语言，
  本故事的实体默认内容语言与 UI 默认语言不要求相同。具体包边界须先冻结，不能双向依赖两套插件。

## 验收标准

### 阶段 0 — 最小能力验证

| #   | 前置条件                                                                  | 操作                                                | 预期结果                                                                                                                                        | 状态 |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| S1  | 一个 Full-sync 实体、存在在途 pull/push                                   | 仅通过拟公开入口停用、retain 重启用、purge 后重启用 | 明确调用入口与权限；停用后的在途写边界可测；retain 不漏更改，purge 不生成用户 DELETE 并从正确水位补拉。缺入口时列出所需引擎前置，不直接写系统表 | ⬜   |
| S2  | 远端父 DELETE 已拉取、客户端重启、随后收到子 UPDATE；另有父尚未拉到的对照 | 经真实拉取/合并路径处理                             | 两类缺父有可持久复验的区分依据；已删不复活，未到不丢数据；覆盖删除证据过期/清理，不出现永久阻塞水位                                             | ⬜   |
| S3  | S1/S2 验证结果与现有 Supabase 夹具                                        | 确认客户端扩展点、服务端职责和最小依赖              | 每个必要改动有故事或本故事明确阶段归属；能复用现有夹具则不新增服务。阶段 A 同步 AC 只在前置交付后解锁                                           | ⬜   |

### 阶段 A — 手写试点

| #   | 前置条件                                                                                    | 操作                                                          | 预期结果                                                                                                                                                                    | 状态 |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| A0  | 阶段 0 已关闭，选定的 Full-sync 测试栈就绪                                                  | 初始化两个独立本地库和一个远端库                              | 不依赖 HTTP QueryCache server；能观察每个实体的 push/pull、watermark、删除事件                                                                                              | ⬜   |
| A1  | 新建语言无关 `LocalizedRecipe` 主表；C-L 生成 `LocalizedRecipeZhHans` / `LocalizedRecipeEn` | 写入 zh-Hans / en 的标题与标签                                | 每门语言各落独立翻译表；主表没有可翻译文本；`resolveTranslation` 返回正确值                                                                                                 | ⬜   |
| A2  | 请求链包含缺失语言、父语言和默认语言                                                        | 向 `resolveTranslation` 传入请求语言、可选偏好与实体默认语言  | 使用 US-911 共享算法生成候选链，返回第一个命中的非缺失值及 `matchedLocale` / `isFallback`；空字符串不降级，全链缺失返回 `value: undefined`                                  | ⬜   |
| A3  | 两台设备离线分别写 zh-Hans / en；主实体已存在                                               | 依次 push / pull                                              | 两门语言的翻译行都保留；一台设备的写入不覆盖另一门语言                                                                                                                      | ⬜   |
| A4  | 两台设备离线创建同一 `(entityId, fieldName, locale)` 翻译行                                 | pull                                                          | 两端使用同一确定性主键；按现有 LWW 规则收敛为一行；不撞唯一约束、不产生重复行                                                                                               | ⬜   |
| A5  | 远端存在 zh-Hans / en / fr，设备 A 只启用 zh-Hans，设备 B 持有三门语言                      | 设备 A 删除主实体，双方同步                                   | 设备 A 在本地事务内删主行与已有翻译行；未启用/尚未拉到语言的远端清理由 S2/S3 冻结的删除合同保证，不能假定本地有这些行；设备 B 最终无孤儿，迟到更新不复活，本地 FTS 不再命中 | ⬜   |
| A6  | 设备 A 只启用 zh-Hans，en 表有远端历史数据                                                  | 先同步 zh-Hans，再切换启用 en                                 | 通过 S1 冻结的公开入口启用 en，从该实体的初始水位补拉历史数据，不影响 zh-Hans 水位                                                                                          | ⬜   |
| A7  | en 表曾经同步过，现被停用                                                                   | 切换语言并执行同步                                            | 停用只停止远端同步；retain：本地数据保留、重新启用从原水位继续；purge：重置该实体水位 + 本地清理，不生成用户 DELETE changelog，重新启用全量补拉                             | ⬜   |
| A8  | 翻译实体 `value` 标记 searchable                                                            | 在 zh-Hans collection 搜索中文词，在 en collection 搜索英文词 | 搜索只命中目标语言；结果包含主实体 id、语言、字段和 snippet；删除后不再命中                                                                                                 | ⬜   |
| A9  | Angular / React / Vue 三端 demo                                                             | 打开翻译编辑、切换 locale、观察 fallback                      | 三端都有同一核心输入输出契约：编辑翻译、显示命中语言、显示 fallback 状态；至少一端连接同步夹具展示启停和补拉                                                                | ⬜   |
| A10 | 任意 string 主实体 id、字段名、locale 边界值                                                | 运行确定性 id 与表名生成测试                                  | 编码无碰撞；locale canonicalization、表名碰撞、保留字、长度边界均 fail-fast 或有明确映射                                                                                    | ⬜   |
| A11 | 多个 fieldName、缺失默认语言、多个 locale 表                                                | 按 fallback 结果列表查询、排序、分页                          | 主实体不重复；缺失翻译不会丢行；排序与分页稳定；记录查询计划和性能数据                                                                                                      | ⬜   |
| A12 | 阶段 A 用例完成                                                                             | 评审 C 对照结果                                               | 研究报告记录 C 的 push、watermark、搜索过滤限制；C 不得被描述为与 C-L 具有相同的部分同步保证                                                                                | ⬜   |
| A13 | pull 批内同时含父 DELETE 与迟到的子 UPDATE/INSERT                                           | 合入变更                                                      | 按 S2 冻结的删除证据区分已删与尚未到达；前者丢弃迟到子变更，后者可补齐；重启、重试和证据清理后均不丢数据、不复活、不永久卡住水位                                            | ⬜   |
| A14 | 生成 100 个翻译实体（模拟 E×L 实体量）                                                      | 度量 init / connect / 首次搜索耗时                            | 记录数据并在研究文档给出预算判定；超预算才考虑多态单语言表变体（见研究文档方案空间），预算达标则 E×L 定案                                                                   | ⬜   |

### 阶段 B — `@aiao/rxdb-plugin-i18n`（三端对称）

| #   | 前置条件                                                                                    | 操作                                                                                   | 预期结果                                                                                                                                        | 状态 |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| B1  | `@Translatable({ fields, locales, defaultLocale })` 加在已由 `@Entity` 装饰的语言无关实体上 | 调用 `createTranslatableEntities()`，再把返回实体加入 `config.entities` 后初始化数据库 | 所有翻译实体在 `SchemaManager.init()` 前注册；新库和已有库都能补建缺失翻译表；不会在 `connect()` 后动态追加实体；装饰器顺序有回归测试           | ⬜   |
| B2  | `fields` 只允许 `string` / `enum` / 明确支持的 nullable string                              | 初始化和写入                                                                           | 不支持的 `json`、`keyValue`、未定义数组表示在构造期 fail-fast；locale 使用 string，不使用会阻碍加语言的 enum                                    | ⬜   |
| B3  | 每个 locale 生成一个 Full-sync 翻译实体                                                     | 停用/启用某 locale                                                                     | 使用 S1 冻结并已交付的公开入口；停用实体仍有本地主适配器，可参与事务删除；新启用、retain 和 purge 分别遵循独立水位语义，不直接修改系统实体      | ⬜   |
| B4  | 主实体配置了 i18n repository                                                                | 删除主实体或批量删除                                                                   | repository 在一个本地事务内先显式删除全部翻译行，再删除主行；所有用户可见删除进入 changelog；未走 i18n 删除路径时 fail-fast，不允许静默留下孤儿 | ⬜   |
| B5  | S2/S3 冻结的客户端与服务端删除合同                                                          | push/pull 删除                                                                         | 父实体删除后，迟到翻译按可持久复验的删除证据处理；在线、离线与新加入设备最终收敛，无孤儿，不预设远端零配合                                      | ⬜   |
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

规范化、父语言展开、链去重与空字符串规则的唯一算法合同见 [US-911](US-911-client-i18n.md)「fallback 链」。
本故事不持有另一份设备偏好，只消费其读接口；纯函数也可由无 UI 的应用显式传入偏好与实体 `defaultLocale`。
`resolveTranslation()` 返回 `{ value, matchedLocale, requestedLocale, isFallback }`；全链缺失返回 `value: undefined`。
这是数据读取结果；UI `t()` 的缺失 key 展示规则由 US-911 单独定义。

### 同步启停与删除证据

`syncLocales()` 表示设备明确允许同步的语言集合，不能从搜索结果或当前 fallback 值隐式推导。
目标语义：新增语言独立补拉；停用只停止远端同步；retain 保留本地数据与水位；purge 清理本地投影并重置相应水位，
不生成用户 DELETE。公开控制入口、在途同步边界及删除证据的持久化规则由阶段 0 冻结，缺失能力先登记并交付。
父行缺失不等于已删除；未确认删除的翻译不得静默丢弃，任何失败不得伪装成同步成功或永久阻塞该语言水位。

## 实现文件

- `modules/recipes-domain/` — 阶段 A 的语言无关试点实体、翻译实体工厂、resolve 纯函数、合并期孤儿规则和 schema 单测
- `packages/rxdb-plugin-i18n/` — `@Translatable` metadata、`createTranslatableEntities()`、i18n repository、fallback 与搜索映射、合并期孤儿规则
- `packages/rxdb-plugin-i18n-{angular,react,vue}/` — 三端响应式绑定，导出同一核心契约
- `packages/rxdb-model/` — 翻译编辑列/表单能力；框架包只做渲染适配
- `packages/rxdb-plugin-sync/` — 阶段 0 验证公开控制入口、删除证据与合并扩展点；必要改动须先明确归属和评审，不承诺零改动
- 现有 Supabase Full-sync 夹具 — 优先复用；新增参考服务须独立登记，不修改 `dev-rxdb-http-server` 的 QueryCache 合同
- `apps/dev-rxdb-{angular,react,vue}/` + 对应 e2e — 三端翻译编辑、fallback、启停和补拉演示

## References

- [数据国际化 / 本地化研究](../../data-i18n-research.md)
- [US-702 全文搜索](./US-702-full-text-search.md)
- [US-703 PGlite 全文搜索](./US-703-pglite-full-text-search.md)
- [US-028 可排序实体](../core/US-028-sortable-entity.md)
- [US-030 声明式存储约束](../core/US-030-declarative-storage-constraints.md)
- [Epic: 未来功能](../../epics/epic-004-future-features.md)
- [vision.md 阶段 6](../../vision.md)
