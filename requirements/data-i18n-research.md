# 数据国际化 / 本地化研究（@aiao/rxdb 场景）

本文保留翻译表粒度的方案比较与风险依据。当前范围、同步前置、数据合同和 AC
统一由 [US-910](stories/future/US-910-data-i18n.md) 定义；locale 算法与偏好读接口由
[US-911](stories/future/US-911-client-i18n.md) 定义。C-L 是选定的生产建模方向，同步可行性尚待阶段 0 验证，
不承诺零引擎改动，也不构成立项授权。

## 1. 范围与术语

| 事项         | 研究边界                                           |
| ------------ | -------------------------------------------------- |
| 数据内容翻译 | 同一实体的字段按语言维护多份内容，归 US-910        |
| UI 文案翻译  | 组件菜单、表头与提示语，归 US-911                  |
| 格式本地化   | UI 按 locale 呈现；引擎查询保持字节序合同          |
| 语言协商     | 消费 US-911 共享算法，实体默认内容语言由调用方传入 |

翻译作为同步数据，意味着需要验证离线写入、冲突收敛、删除与迟到更新的组合；
分表本身只能改变数据与同步粒度，不能证明这些行为已经成立。

## 2. 当前仓库能力盘点

### 2.1 Schema 与迁移

实体使用 `@Entity` 元数据，已有缺失实体表补建与显式库级迁移机制。新增翻译实体与迁出既有文本列是两件事：
后者需要搬迁、旧客户端兼容与回滚合同。证据入口是 [RxDB](../packages/rxdb/src/RxDB.ts) 的建表与迁移流程。

### 2.2 同步

现有 Full、Filter、QueryCache、None 的边界见 [同步声明](../packages/rxdb/src/entity/sync-options.interface.ts)。
Filter 的远端过滤作用于 pull / 清理，不限制 push；按不同语言集合过滤同一实体时，不能假定已有独立水位或自动基线补拉。

[`RxDBSync`](../packages/rxdb/src/system/sync.ts) 的 `enabled` 与每实体水位是内部状态，系统专用写权限不等于应用可直接控制。
语言启停、retain、purge 与在途同步的公开入口需要 US-910 S1 证明；若缺入口，先明确最小引擎前置。

### 2.3 HTTP 与同步测试基础设施

HTTP v1 和 `dev-rxdb-http-server` 提供 QueryCache / REST 示例，可验证行缓存与 outbox，
不能承担 Full / Filter changelog 与冲突验收。同步试点优先复用现有 Supabase Full-sync 测试栈；
只有阶段 0 证明缺少必要能力时才另定服务或夹具，不预设必须新建一套远端。

### 2.4 搜索

搜索按 `config.entities` 的 searchable 字段安装后端。C-L 可按 collection 隔离语言；
C 单表的 locale 是普通行字段，不能据此假定搜索已支持 locale where。
原生搜索命中翻译行，需要映射回主实体。生成实体的注册时机、结果形状和后端矩阵见 US-910 的合同。

### 2.5 现有 Recipe

`modules/recipes-domain` 的 Recipe 是 HTTP QueryCache 示例，已有 `title` / `tag` 主表字段。
直接改造它会同时引入字段搬迁、双重权威与同步模式混用，因此试点采用新的语言无关实体，现有 Recipe 的迁移另定范围。

## 3. 方案空间

### 3.1 内嵌映射 / 每语言主表列

内嵌语言映射会让不同语言的编辑进入同一业务行冲突域；每语言一组列则在增加语言时涉及主表结构。
两者都将可翻译内容与主实体存储绑在一起，不作为当前方向。

### 3.2 C：单张翻译表 + `locale` 列

```text
Translation { id, parentId, fieldName, locale, value }
```

增加语言是新增行，实体数量少。但语言集合变化与同实体水位耦合；Filter 不限制 push，
清理后重新启用某语言也需要补拉策略。现有搜索 collection 不能直接按 locale 切该表。
因此 C 保留为研究对照，重点验证同步控制与搜索过滤成本，不进入当前生产 API。

### 3.3 C-L：每门语言一张翻译表

```text
LocalizedRecipeZhHans { id, parentId, fieldName, value }
LocalizedRecipeEn     { id, parentId, fieldName, value }
```

每个实体、每门语言单独成表，能与实体级同步和搜索 scope 对齐，不改主表列。
独立水位是可复用粒度，公开启停入口及其正确性仍待验证，不能把修改内部系统行当作已交付能力。

成本是 E×L 个实体、跨 repository fallback、所有语言的删除收敛，以及按语言清理与重新启用的边界。
这些分别由 US-910 阶段 0、同步 AC 与实体数量压力探针验证。

### 3.4 多态单语言表（C-L 合并实体维度）

```text
TranslationZhHans { id, parentType, parentId, fieldName, value }
```

它将 E×L 张表收敛到 L 张，但多态引用难以复用主实体外键，失去实体粒度水位隔离，
删除与搜索需要识别 parentType。仅在 C-L 的实体数量压力实测超预算时重新比较，不预设运行时自动切换。

## 4. C-L 数据模型

### 4.1 生成实体

生成实体在建表与搜索扫描前进入配置，是显式准备步骤；装饰器只登记声明。
当前生成 API、装饰器顺序与注册时机统一见
[US-910 生成翻译实体](stories/future/US-910-data-i18n.md#生成翻译实体)。

### 4.2 翻译行

一行表示一个主实体字段的一门语言内容，locale 由实体身份表达。
字段、ID 编码、自然唯一键与允许类型只在 [US-910 数据与 API 契约](stories/future/US-910-data-i18n.md#数据与-api-契约)维护。
分表不代替外键、碰撞检查或同步删除证据。

### 4.3 兼容性

生成新表不代表既有主表字段能自动迁出。存量翻译搬迁需要独立的迁移、兼容窗口与回滚范围，
不由本研究预设双写或自动删列。

## 5. Locale 与 fallback

### 5.1 三种 locale 状态

设备探测值、用户显示偏好与设备同步语言集合的职责不同。前两项由 US-911 的接口提供，
同步集合归 US-910；不从 UI 当前语言隐式改变同步范围，也不重复建立偏好实体。

### 5.2 fallback 契约

唯一算法合同见 [US-911 fallback 链](stories/future/US-911-client-i18n.md#fallback-链共享唯一契约)。
数据翻译显式传入实体默认内容语言，消费同一候选链，缺失值保留数据 API 的缺失语义；
不强制采用 UI 默认语言或某个 I18nSettings 实体。

## 6. 同步、切换与删除

### 6.1 C-L 启停（无 profile 机械）

分表使语言控制可以按实体划分，但公开入口、权限与在途同步边界尚未冻结。
US-910 S1 先验证停用、retain、purge 与重新启用；不直接修改系统表来模拟公共能力。

### 6.2 启停语义（替代原 Profile 变化）

retain 与 purge 的当前目标及关闭条件见 US-910 S1、A6/A7、B3。
不能只凭每实体水位推断无漏拉，清理、重启和正在执行的 push / pull 都需要进入同一验证。

### 6.3 创建顺序

父子写入与事务要求见 US-910。主实体与翻译必须有可支持的本地事务边界；
远端父行尚未到达时，合并需要可补齐策略，不能用永久回滚让语言水位停住。

### 6.4 删除顺序

显式删除翻译行再删除主行可以记录客户端已持有的数据，但不足以证明未启用语言和迟到更新都能收敛。
FK 级联也不代替跨设备的删除日志。

[pullBatchOnce](../packages/rxdb-plugin-sync/src/pull-batch.ts) 合入远端变更时不生成本地 changelog。
因此父行查不到或本地没有父行日志，都不能区分“已经删除”与“尚未拉到”。
US-910 S2/S3 必须先冻结可持久复验的删除证据、保留与恢复行为，以及子行合并前的扩展点和服务端职责。
在此之前不宣称客户端孤儿丢弃已有可靠实现，也不承诺远端零配合或 sync 零改动。

## 7. 搜索与查询

C-L 的 collection scope 是选型优势，仍需验证翻译命中映射、删除后的索引摘除、
fallback 列表不重复、缺失翻译不丢主行，以及排序分页稳定性。
字段形状与适配器矩阵以 US-910 为准；派生镜像列等优化由实测证据触发。

## 8. 阶段路线

完整前置与关闭条件见 [US-910 交付阶段](stories/future/US-910-data-i18n.md#交付阶段)。
同步方案先由阶段 0 证明；本地实验可先验证，但不能用本地结果关闭同步 AC。

### 阶段 A：方案验证

在阶段 0 证明并交付必要能力后，用双本地库与现有同步测试栈验证 C-L。
保留 C 的比较结果及 E×L 实体数量探针；预算判断基于记录的 init / connect / 首次搜索数据。

### 阶段 B：插件

只在试点和必要引擎前置完成后交付插件与三端绑定。
共享 locale 接口由 US-911 先冻结，包依赖不能形成 UI 与数据插件双向依赖。

## 9. 决策记录

当前建模方向是 C-L；C 保留研究对照，多态单语言表仅作为压力超预算后的替代设计。
同步控制、删除证据与合并扩展点尚待阶段 0 验证，当前交付范围只在 US-910 维护，演进过程由 Git 历史记录。

## 参考

- [US-910](stories/future/US-910-data-i18n.md)、[US-911](stories/future/US-911-client-i18n.md)、[客户端国际化研究](client-i18n-research.md)
- [RxDB](../packages/rxdb/src/RxDB.ts)、[SchemaManager](../packages/rxdb/src/schema/SchemaManager.ts)
- [pull-batch](../packages/rxdb-plugin-sync/src/pull-batch.ts)、[cleanup-expired](../packages/rxdb-plugin-sync/src/cleanup-expired.ts)
- [搜索插件](../packages/rxdb-plugin-search/src/plugin.ts)
- [RxDB schema](https://rxdb.info/rx-schema.html)
- [localize_translate](https://hex.pm/packages/localize_translate/0.1.0/files/guides/translatable_database_systems.md)
- [emdash i18n PR](https://github.com/emdash-cms/emdash/pull/916)
