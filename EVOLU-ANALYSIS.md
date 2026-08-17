# Evolu 代码分析与 rxdb 借鉴建议

> 分析日期：2026-08-17  
> Evolu 基线：`49ea8ca49956`  
> rxdb 基线：`91cb5a13c70a`  
> 文档性质：只读技术调研，不代表已排期需求

## 1. 结论

✅ **值得做，但要拆着学，不能照搬。**

Evolu 最有价值的不是某个框架 binding，也不是它自研的函数式基础设施，而是以下两类能力：

1. 把同步明确拆成时钟、合并、对账、传输和存储协议。
2. 用 property-based test、真实消费者 bundle 和可执行文档守住协议与公共 API。

当前 rxdb 的优势是 Repository、关系模型、增量查询缓存、分支、commit、undo/redo，以及多后端和 Angular/React/Vue 三端能力。这些能力比 Evolu 更丰富，不应为了引入 HLC 或端到端加密而重写现有数据层。

正确路线是：**先补质量门禁，再做可选的类型增强，最后以独立插件验证新同步协议。**

## 2. 总体对比

| 维度 | Evolu | 当前 rxdb | 判断 |
| --- | --- | --- | --- |
| 冲突合并 | HLC + 字段级 LWW | change/行级 LWW | Evolu 对不冲突字段的保留更好 |
| 同步进度 | timestamp 集合对账 | 远端自增 `changeId` 水位 | Evolu 更适合多节点和更换 relay |
| 服务端模型 | 保存 owner、timestamp、加密 blob | adapter 提供 pull、merge、filter 等业务能力 | 两者定位不同，不能强行统一 |
| 加密边界 | relay 不理解业务内容 | 服务端可以查询、过滤并使用 RLS | blind relay 不能替代现有后端 |
| Schema | Standard Schema V1 + branded ID | 丰富 entity metadata | 适合增量增强，不适合替换 |
| 查询能力 | 强类型 SQL 与订阅 | Repository + QueryCache + 关系/树图查询 | 当前项目更完整 |
| 框架绑定 | React/Vue/Svelte 等薄绑定 | Angular/React/Vue 对称 API | 只借鉴底层订阅方法 |
| 质量门禁 | property test、bundle、JSDoc 示例 | coverage、API surface、runtime conditions | Evolu 的三类门禁值得补齐 |

## 3. P0：低风险、高收益，优先落地

### 3.1 Property-based 协议测试

Evolu 对协议 codec 做 10,000 次随机 round-trip，而不是只维护少量手写 fixture：

- Evolu：`test/integration/vitest/local-first/Protocol/Protocol.test.ts:341`

当前项目最适合先覆盖以下不变量：

- `encode(decode(value))` 和 `decode(encode(value))` 保持语义一致。
- change、patch、inversePatch 在序列化后不丢字段。
- update → undo → redo 恢复到确定状态。
- 重复投递、乱序投递不会产生额外数据。
- `null`、空字符串、Unicode、BigInt、二进制和极端时间值正确往返。
- SQLite、PGlite、Supabase 等 adapter 对公共值域的行为一致。

这类测试对协议层的价值高于继续堆固定样例，因为很多错误只会出现在字段组合、边界长度和操作序列中。

### 3.2 真实消费者 bundle 门禁

Evolu 会实际构建 Vite/Webpack 消费者，并校验 tree-shaking 和 Brotli 体积：

- Evolu：`test/integration/vitest/Bundle/Type.test.ts:336`

当前已有公共 API surface 审计：

- rxdb：`scripts/audit/api-surface.mjs:27`

但 API 不变不代表 bundle 没有膨胀。建议建立 Angular/React/Vue 最小消费者，至少检查：

- ESM tree-shaking 后的产物体积。
- Brotli 后体积及允许增长阈值。
- 是否意外打包全部 adapter、SQLite runtime 或 Node polyfill。
- browser/node/electron 条件导出是否选择正确。
- 单独导入子路径时是否把根入口一起打入。

门禁应该比较稳定的压缩产物，不要对原始字节做过度敏感的精确快照。

### 3.3 网站和 TSDoc 的可执行示例

Evolu 有执行 JSDoc 示例的脚本：

- Evolu：`scripts/test-jsdoc.mts:25`

但它自己的源码和站点文档已经漂移：

- `EvoluConfig.appOwner` 当前必填：`packages/common/src/local-first/Evolu.ts:129`
- mutation 当前返回 `{ id }`：`packages/common/src/local-first/Schema.ts:213`
- 网站示例未传 `appOwner`，仍读取 `result.ok/result.value.id`：`apps/web/src/app/(docs)/docs/local-first/page.mdx:107`、`:217`

因此当前项目不能只测试源码 TSDoc，还应抽取 website Markdown/MDX 代码块做 typecheck。否则源码示例是绿的，用户真正看到的文档仍可能已经失效。

## 4. P1：增量吸收，不建立第二套模型

### 4.1 在 metadata 上增加 Standard Schema validator

Evolu 接受 Standard Schema V1：

- Evolu：`packages/common/src/local-first/Schema.ts:95`

当前 entity metadata 已承载字段、关系、格式、同步等语义：

- rxdb：`packages/rxdb/src/entity/metadata-options.interface.ts:1129`

因此不应引入第二套 Schema 真相源。更合适的做法是在现有 metadata 上增加可选 validator，用于以下边界：

- Repository create/update。
- 外部同步数据进入本地数据库之前。
- import 和 migration。
- 表单与服务端共享校验规则。

validator 只负责值校验，关系、持久化、生成器和 UI 语义仍由 metadata 管理。

### 4.2 由生成器提供 branded ID

Evolu 使用品牌类型区分表级 ID，能阻止 `TodoId` 被传给需要 `UserId` 的 API。它是纯类型能力，运行时成本低，适合由现有 generator 生成。

落地时应保持 userspace 兼容：

- 先 opt-in，不能一次性让所有现有实体类型报错。
- 外键与主键使用同一品牌来源。
- 编解码和数据库列仍使用原始标量。
- 明确提供边界转换函数，不允许业务代码到处使用类型断言。

### 4.3 建立稳定 snapshot/subscription primitive

Evolu 的 React binding 使用 `useSyncExternalStore`：

- Evolu：`packages/react/src/local-first/createEvoluBinding.tsx:124`

可借鉴它避免 tearing 和重复订阅的方式，但不能只优化 React。应先在公共层提供稳定的 snapshot 与 subscription，再分别映射：

- React：`useSyncExternalStore`
- Angular：Signal bridge
- Vue：`shallowRef` 与 effect scope

只有在公共语义一致的前提下，框架层才允许使用各自最合适的运行时 API。

## 5. P2：先写 RFC，再做实验插件

### 5.1 HLC + 字段级确定性合并

Evolu 的 16 字节 HLC 包含 `millis + counter + nodeId`：

- Evolu：`packages/common/src/local-first/Timestamp.ts:102`

数据库按列比较时间戳，只应用更新的字段：

- Evolu：`packages/common/src/local-first/Db.ts:550`

当前项目的 LWW 以 change 的 `createdAt` 为主，相同时再比较 `clientId`：

- rxdb：`packages/rxdb/src/version/LWWConflictResolver.ts:21`

字段级合并能解决一个真实问题：设备 A 离线修改标题，设备 B 修改状态，合并后两个修改都保留，而不是整行后写覆盖前写。

但它不是免费午餐，必须先定义这些边界：

- `startAt/endAt` 等跨字段约束可能被合并成非法组合。
- JSON 和数组第一版应作为原子字段处理。
- tombstone 必须有独立时钟，否则旧更新可能复活已删除记录。
- HLC 状态必须持久化，并处理系统时间回拨。
- 对远超本地时间的 timestamp 要有限制，避免坏钟或恶意节点长期占据最高版本。
- patch、inversePatch、branch 和 undo/redo 语义不能被破坏。

建议第一版只支持顶层字段，并允许 metadata 声明“原子合并组”。不要直接替换当前 change 模型。

### 5.2 把同步协议和后端 transport 分开

当前远端 adapter 契约直接暴露 `pullChanges`、`mergeChanges`、filter、branch 等能力：

- rxdb：`packages/rxdb/src/rxdb-adapter.ts:258`

当前同步状态依赖远端自增 `changeId`：

- rxdb：`packages/rxdb/src/system/sync.ts:154`

Evolu 的 Storage 只认识 owner、timestamp 和加密 blob：

- Evolu：`packages/common/src/local-first/Storage.ts:121`

建议未来形成以下边界：

```text
Repository / Change
        |
        v
SyncProtocol：时钟、合并、对账、编码
        |
        v
SyncTransport：Supabase、HTTP、P2P、文件
```

现有 adapter 应通过 bridge 接入，保证已有 API 和同步行为不变。新协议必须是独立插件或实验包，不能塞进核心包后让所有用户承担体积和迁移成本。

### 5.3 集合对账替代中心 changeId 水位

Evolu 使用 timestamp set、XOR fingerprint、range splitting 和 SQLite skiplist：

- Evolu：`packages/common/src/local-first/Storage.ts:1084`

它适合多 relay、长期离线、后端迁移以及任意两节点对账。相比中心化 `changeId`，它不要求所有写入经过同一个严格递增序列。

代价也很明确：

- 实现和调试复杂度高。
- fingerprint 是概率性摘要，必须定义碰撞后的校验或恢复路径。
- 本地需要额外索引和存储空间。
- 小数据量下可能比简单游标更慢。

落地前必须 benchmark 10 万和 100 万 change 下的索引体积、首次对账、增量对账、断线恢复和网络字节数。没有数据证明 `changeId` 是瓶颈，就不应该做。

### 5.4 将 Owner 借鉴为 SyncScope，而不是权限系统

Evolu 区分 AppOwner、ShardOwner、SharedOwner 和 SharedReadonlyOwner：

- Evolu：`packages/common/src/local-first/Owner.ts:43`

它把同步分区、密钥域和整分区删除边界统一起来。当前项目可以借鉴一个较小的 `SyncScope` 概念：

```ts
interface SyncScope {
  readonly namespace: string;
  readonly keyId?: string;
}
```

但 Owner 不能替代业务权限。Supabase RLS、服务端过滤、审计和管理查询仍属于授权层；blind relay 看不到业务数据，也就无法提供这些能力。

## 6. 有限借鉴项

### 6.1 纯依赖注入

Evolu 用 `XDep & YDep` 抽象时间、随机数、网络、SQLite 和日志，适合协议、时钟、加密等纯核心模块。

不适合全仓改写。当前 adapter、RxJS 和框架服务已经形成稳定边界，为统一风格重写只会增加类型噪声和迁移风险。

### 6.2 强类型 Worker 消息

Evolu 的平台层值得参考其消息类型和错误边界，但当前项目已有 Worker、SharedWorker、Comlink 和 desktop host protocol。除非现有跨线程协议出现实际不一致，不应把它排在同步协议和质量门禁之前。

### 6.3 Result 类型

`Result<T, E>` 对可恢复错误有价值，但不应成为全仓 P0 重构。RxJS error channel、Promise rejection 和现有公开 API 已经存在；强制统一会破坏 userspace。

它更适合用于新协议内部，或明确需要穷尽处理的 adapter 边界。

## 7. 明确不应照搬

### 7.1 不复制 Evolu 的基础设施体量

Evolu 的 `Task.ts` 超过 6,000 行，`Type.ts` 超过 12,000 行。它们服务于 Evolu 自己的整体编程模型，不是引入 HLC 或 RBSR 的前置条件。

当前项目应继续使用 TypeScript strict、RxJS、现有 DI 和测试工具，不再造一套通用 effect/type runtime。

### 7.2 不放弃当前高价值能力

不能为了贴近 Evolu 而削弱以下能力：

- Repository 和关系语义。
- 树、图和增量查询。
- QueryCache：`packages/rxdb/src/repository/QueryManager.ts:78`
- branch、commit、patch、inversePatch、undo/redo：`packages/rxdb/src/system/change.ts:121`
- Angular/React/Vue 对称 API。

### 7.3 不把所有删除改成永久 soft delete

软删除适合同步 tombstone，但不等于业务删除策略。隐私删除、租户清理、缓存淘汰和数据库维护仍需要硬删除能力。

### 7.4 不把所有远端改成 blind relay

Evolu 的 E2EE/PADME 设计值得研究：

- Evolu：`packages/common/src/local-first/Protocol.ts:1869`

但 blind relay 会失去服务端查询、RLS、索引过滤、审计和数据运营能力。它应该是一个可选同步模式，不是现有 Supabase/PG 路线的替代品。

### 7.5 不把 Evolu 当作完成态模板

Evolu 源码中仍有 `deleteDatabase/deleteOwner`、协作 quota、readonly sync 等未完成项，同时已出现源码与网站示例漂移。应该学习其成熟部分，不替它补全尚未验证的设计假设。

## 8. 推荐落地顺序

| 阶段 | 工作 | 退出条件 |
| --- | --- | --- |
| P0-1 | 协议与 change codec 的 property-based test | 核心不变量覆盖，失败可复现为固定 seed |
| P0-2 | 三框架真实消费者 bundle budget | tree-shaking、条件导出、Brotli 阈值进入 CI |
| P0-3 | TSDoc + website 示例执行 | 文档 API 漂移能在 CI 中失败 |
| P1-1 | 可选 Standard Schema validator | 不建立第二套 metadata，不破坏现有 API |
| P1-2 | generator opt-in branded ID | 主外键品牌一致，运行时格式不变 |
| P1-3 | 公共 snapshot/subscription primitive | Angular/React/Vue 行为和 API 对称 |
| P2-1 | `rxdb-sync-protocol` RFC | 明确时钟、字段粒度、tombstone、兼容边界 |
| P2-2 | HLC + 顶层字段合并实验 | 乱序、重复、回拨、坏钟和 undo/redo 测试通过 |
| P2-3 | reconciliation benchmark | 数据证明优于现有 `changeId` 后才进入实现 |
| P2-4 | SyncScope/E2EE 可选模式 | 与 Supabase RLS 模式并存，不取代现有 adapter |

上一个任务要先完成：当前 roadmap 的 P1 不应被一个“大一统 CRDT 重写”打断。同步协议研究必须作为独立 RFC 和实验插件推进，复杂度也不可能靠一次重构按时交付。

## 9. 代码评价

| 项目 | 评价 | 原因 |
| --- | --- | --- |
| HLC + 字段级合并 | 🟢 好 | 数据结构清晰，确定性强，解决真实离线冲突 |
| Storage/Protocol/Relay 分层 | 🟢 好 | 协议不依赖具体业务后端 |
| 集合对账 | 🟢 好但昂贵 | 扩展性强，复杂度和验证成本也高 |
| Standard Schema + branded ID | 🟢 好 | 低运行时成本，边界更安全 |
| 自研 Task/Type runtime | 🟡 凑合 | 对 Evolu 自洽，对当前项目性价比低 |
| blind relay 作为唯一后端 | 🟡 场景化 | 隐私强，但牺牲服务端业务能力 |
| 源码与网站文档一致性 | 🔴 垃圾 | 已有公开示例与当前 API 不一致 |

## 10. 最终判断

最值得学习的顺序是：

1. **质量门禁**：property test、bundle budget、可执行网站示例。
2. **类型边界**：可选 Standard Schema validator、branded ID。
3. **同步内核**：协议/transport 分离、HLC、字段级合并。
4. **高级同步**：集合对账、SyncScope、可选 E2EE。

不要优先学习 Evolu 的大规模基础设施，也不要立刻引入全量 CRDT。先用测试和 benchmark 证明问题，再以独立插件演进同步协议，才能同时满足“好品味”和“Never break userspace”。
