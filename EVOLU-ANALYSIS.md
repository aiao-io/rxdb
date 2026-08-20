# Evolu 代码分析与 rxdb 借鉴建议

> 分析日期：2026-08-17  
> Evolu 基线：`49ea8ca49956`  
> rxdb 基线：`91cb5a13c70a`  
> 文档性质：只读技术调研，不代表已排期需求  
> 时效边界：第 1–7 节是长期有效的技术判断；第 8–11 节的排期以上述 rxdb 基线时的 `requirements/status-overview.md` 为准，状态变化后必须重新核对，不得直接照抄执行

## 1. 结论

✅ **值得做，但要拆着学，不能照搬。**

Evolu 最有价值的不是某个框架 binding，也不是它自研的函数式基础设施，而是以下两类能力：

1. 把同步明确拆成时钟、合并、对账、传输和存储协议。
2. 用 property-based test、真实消费者 bundle 和可执行文档守住协议与公共 API。

当前 rxdb 的优势是 Repository、关系模型、增量查询缓存、分支、commit、undo/redo，以及多后端和 Angular/React/Vue 三端能力。这些能力比 Evolu 更丰富，不应为了引入 HLC（Hybrid Logical Clock，混合逻辑时钟）或端到端加密而重写现有数据层。

正确路线是：**先补质量门禁，再做可选的类型增强，最后以独立插件验证新同步协议。**

## 2. 总体对比

| 维度       | Evolu                             | 当前 rxdb                                   | 判断                                                                            |
| ---------- | --------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| 冲突合并   | HLC + 字段级 LWW                  | change/行级 LWW                             | Evolu 对不冲突字段保留更好；只做实验插件，不替换现有 change 模型（见 5.1）      |
| 同步进度   | timestamp 集合对账                | 远端自增 `changeId` 水位                    | Evolu 更适合多节点和更换 relay；须先 benchmark 证明 `changeId` 是瓶颈（见 5.3） |
| 服务端模型 | 保存 owner、timestamp、加密 blob  | adapter 提供 pull、merge、filter 等业务能力 | 两者定位不同，不能强行统一                                                      |
| 加密边界   | relay 不理解业务内容              | 服务端可以查询、过滤并使用 RLS              | blind relay 不能替代现有后端                                                    |
| Schema     | Standard Schema V1 + branded ID   | 丰富 entity metadata                        | 适合增量增强，不适合替换                                                        |
| 查询能力   | 强类型 SQL 与订阅                 | Repository + QueryCache + 关系/树图查询     | 当前项目更完整，不引入第二套查询层                                              |
| 框架绑定   | React/Vue/Svelte 等薄绑定         | Angular/React/Vue 对称 API                  | 只借鉴底层订阅方法                                                              |
| 质量门禁   | property test、bundle、JSDoc 示例 | coverage、API surface、runtime conditions   | Evolu 的三类门禁值得补齐                                                        |

## 3. P0：低风险、高收益，优先落地

### 3.1 Property-based 协议测试

Evolu 对 SQLite 值 codec 做 10,000 次随机 round-trip：

- Evolu：`test/integration/vitest/local-first/Protocol/Protocol.test.ts:341`（`{ numRuns: 10000 }` 在 `:447`）

需要说清事实边界，避免把这条借鉴的理由抬高：**Evolu 全仓 `fast-check` 只出现在这一个文件、一处 `fc.assert`**，覆盖的是 `encodeSqliteValue/decodeSqliteValue`，不是协议帧本身；同文件其余 1500+ 行仍是手写 fixture。所以正确的论据不是「Evolu 用 property test 守住了协议」，而是**这条路径的边际投入极小**——一处断言、一个 generator，就换来了手写样例覆盖不到的字段组合空间。当前项目应该按同样的性价比逻辑投入，而不是按「Evolu 已经做得很完备」来排期。

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

但它自己的源码和站点文档已经漂移，而且漂移的不只是字段，**连调用形状都变了**：

| 维度          | 当前源码                                                                                                                | 网站示例                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 构造签名      | `createEvolu(schema, config): Task<Evolu<S>, never, EvoluPlatformDeps>`：`packages/common/src/local-first/Evolu.ts:890` | 柯里化 deps-first 的 `createEvolu(evoluReactWebDeps)(Schema, {...})`：`apps/web/src/app/(docs)/docs/local-first/page.mdx:107` |
| `appOwner`    | `EvoluConfig` 上必填，且 `config` 不是 `Partial`：`Evolu.ts:129`、`:893`                                                | 未传                                                                                                                          |
| mutation 返回 | `{ readonly id }`，注释明写「Mutations never fail」：`packages/common/src/local-first/Schema.ts:213`                    | 仍读 `result.ok` / `result.value.id`：`page.mdx:217`                                                                          |

也就是说：Evolu 有一套能跑的 JSDoc 示例脚本，源码注释是绿的，用户照着官网抄的代码却连类型都过不了。

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

其中 **inversePatch 是当前项目特有、也最容易在第一版就炸的一条**，值得单独展开：现有 undo 依赖整条 change 的 `inversePatch`，隐含假设是「撤销一个 change ≈ 还原该 change 覆盖的那批列」。一旦合并粒度降到字段，这个假设不再成立——某些列可能已被远端的更高 timestamp 更新，此时回放 inversePatch 会把不属于本次 change 的列一起打回旧值。字段级合并要么让 inversePatch 也带上逐字段时钟并在回放时做条件写，要么显式定义「undo 只在本地时钟仍是该字段最高版本时生效」。这一条必须在 A5.1 的 RFC 里给出结论，不能留到实现期发现。

同理需要提前回答的还有：QueryCache 与增量查询当前按 change 粒度失效，字段级合并会把一次远端合并拆成多列独立生效，失效范围和触发次数都要重新定义（见 7.2）。

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

Evolu 的 `Task.ts` 超过 6,000 行，`Type.ts` 超过 12,000 行。它们服务于 Evolu 自己的整体编程模型，不是引入 HLC 或 RBSR（Range-Based Set Reconciliation，范围集合对账）的前置条件。

当前项目应继续使用 TypeScript strict、RxJS、现有 DI 和测试工具，不再造一套通用 effect/type runtime。

### 7.2 不放弃当前高价值能力

不能为了贴近 Evolu 而削弱以下能力：

- Repository 和关系语义。
- 树、图和增量查询。
- QueryCache：`packages/rxdb/src/repository/QueryManager.ts:78`
- branch、commit、patch、inversePatch、undo/redo：`packages/rxdb/src/system/change.ts:121`
- Angular/React/Vue 对称 API。

但「不削弱」不等于「无需重新验证」。以下两条是 A5 必须先答、而不是实现时再撞上的问题：

- 字段级合并后，QueryCache 与增量查询的失效粒度和触发频次如何定义（一次远端合并会变成多列独立生效）。
- inversePatch 在部分列已被远端更新时的回放语义（见 5.1）。

写不出这两条的答案，A5.2 就不该开工。

### 7.3 不把所有删除改成永久 soft delete

软删除适合同步 tombstone，但不等于业务删除策略。隐私删除、租户清理、缓存淘汰和数据库维护仍需要硬删除能力。

### 7.4 不把所有远端改成 blind relay

Evolu 的 E2EE/PADME 设计值得研究：

- Evolu：`packages/common/src/local-first/Protocol.ts:1869`

但 blind relay 会失去服务端查询、RLS、索引过滤、审计和数据运营能力。它应该是一个可选同步模式，不是现有 Supabase/PG 路线的替代品。

### 7.5 不把 Evolu 当作完成态模板

Evolu 源码中仍有 `deleteDatabase/deleteOwner`、协作 quota、readonly sync 等未完成项，同时已出现源码与网站示例漂移。应该学习其成熟部分，不替它补全尚未验证的设计假设。

## 8. 结合 requirements 的活动优先级

下面的排序以 requirements 的依赖和用户可见风险为准，不直接照抄 story 的 `priority` 字段。`status-overview.md` 仍是状态真相源，本节只给执行顺序，不修改任何 story 状态。

### A0：先关闭当前进行中的交付

| 顺序 | 活动                                       | requirements 依据                              | 为什么现在做                                                                                                                                    | 退出条件                                                                                                                              |
| ---- | ------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A0.1 | 收尾共享桌面 host 契约、真实打包与重启测试 | `US-207`、`US-210`、`US-505`；roadmap 约束 2/3 | 三条进行中故事实际上卡在同一个包边界、跨进程重启和三平台矩阵缺口；继续开新抽象只会扩大未完成面                                                  | Electron/Tauri 包边界冻结；单连接事务语义、IPC/Rust command、重启恢复和三平台 smoke/e2e 全部有证据；不以 Web/memory fallback 掩盖失败 |
| A0.2 | 对 `US-904` 做阶段化收口                   | `US-904`；roadmap 约束 4                       | 当前仅阶段 B 已交付，阶段 A/C/D 未开始；先把 fake provider、协议抽取、Electron/Tauri 依赖和真实存储边界拆清，避免 DevTools 作为“进行中”长期悬挂 | 阶段 A/C 的契约和测试可独立合并；Electron 阶段 D 只在 `US-207 + US-504` 满足后开始；Tauri 路径遵循 `US-210 → US-505 → US-905`         |

`US-207 → US-210/US-505` 是共享 host 契约的硬顺序；`US-904` 的设计抽取可以并行，但不能反向阻塞桌面存储收尾。这个 A0 是当前最有用户价值的活动，优先级高于所有 Evolu 新同步研究。

### A1：补生命周期底座，关闭已知泄漏

| 顺序 | 活动                       | requirements 依据                   | Evolu 借鉴点                                    | 退出条件                                                                                             |
| ---- | -------------------------- | ----------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A1.1 | `LifecycleScope`           | `US-013`，roadmap P1                | 借鉴 Evolu 对资源、连接、订阅生命周期的显式管理 | 逆序、幂等、异步释放、错误隔离、嵌套语义由测试冻结；不增加 `acquireAsync()` 这类当前没有调用方的 API |
| A1.2 | 插件 `install(scope)` 迁移 | `US-014`，明确依赖 `US-013`         | 借鉴作用域化副作用和可诊断释放                  | 四个插件迁移完成；三处已知泄漏关闭；`destroy()` 进入废弃周期；公共类型契约测试通过                   |
| A1.3 | 适配器依赖纪元             | `US-015` 阶段 A；必须在 `US-014` 后 | 借鉴纯依赖边界，不引入 Evolu 的全局 DI 容器     | `adapterConnected$` 等待/断开/reconnect 场景稳定；阶段 B 插件依赖图没有真实症状前不排期              |

`US-016`（init 失败后连接纪元和停机收敛）已有具体症状，但 story 文件尚未创建；应在 `US-014` 后切片。`US-017` 只有在三框架绑定确实出现重复清理或 teardown 不一致时才开工，不能因为 Evolu 有框架 binding 就预先扩张范围。

### A2：先解决已知的类型和公开契约风险

| 顺序 | 活动                              | requirements 依据                                                           | 价值判断                                                                                                          |
| ---- | --------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| A2.1 | 生成器 `default` 序列化与显式失败 | `US-018`，High，Backlog；roadmap P2                                         | bigint、Uint8Array 和函数工厂当前会生成错误或静默丢失的客户端代码，这是直接的用户可见正确性问题，比 HLC 更急      |
| A2.2 | 子路径 API surface 纳入门禁       | `US-601`，epic-007，Backlog                                                 | requirements 已确认 12 个公开子路径入口的导出表面只能人工审查；先补门禁，后续任何包边界重整才有可观测的破坏性信号 |
| A2.3 | change/codec property-based test  | `US-303` 已 Done，但 requirements 明确 codec、历史、跨 Tab 是公共正确性边界 | 直接吸收 Evolu 的随机 round-trip；重点覆盖 bigint/binary、旧格式、未知版本、乱序和重复操作，而不是重写 `US-303`   |
| A2.4 | 可选 Standard Schema validator    | 当前无对应 story；挂在现有 metadata，不建立第二套 schema                    | 先作为 RFC/小型实验，等 `US-012` 已稳定的 metadata 和 `US-018` 的 generator 契约使用场景明确后再建 story          |
| A2.5 | generator opt-in branded ID       | 当前无对应 story                                                            | 类型收益真实但不阻塞当前交付；放在 validator 后，避免同时改 metadata、generator、外键和所有三端类型               |

`US-012`、`US-011`、`US-303` 已完成，不应因为 Evolu 的 Standard Schema 或 codec 设计重新开一套平行模型。新活动必须复用现有 metadata、codec envelope、system migration 和 identity key 约束。

### A3：补质量门禁，跟随公开 API 变更执行

这三项目前不是现有 story，应该作为 tooling/CI 活动或新 story 评审，不得在状态文件里假装已认领：

1. **三框架真实消费者 bundle budget**：与 `US-601` 和桌面包边界重整一起验证 tree-shaking、条件导出、Brotli 体积。
2. **TSDoc + website 示例执行**：覆盖 website Markdown/MDX，而不只执行源码注释；Evolu 自己已经证明只测源码是不够的。
3. **协议 property test 基础设施**：优先用于现有 change codec，再为未来 sync protocol 共用 generator 和 seed 重放机制。

A3 的优先级高，但不应打断 A0 的真实桌面应用收尾。原则是：新增公开 API 或包边界变化的 PR 必须同时带门禁；纯内部修复可先补最小测试，再逐步扩充 bundle 和文档覆盖。

### A4：按 requirements 的固定依赖推进协作能力

| 顺序 | 活动                                 | requirements 依据                                                                      | 与 Evolu 的关系                                                                                                                                                                                                                 |
| ---- | ------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A4.0 | **从主线发布新的非迁移 bridge 版本** | `US-305` FR-030；roadmap 约束 5；`status-overview.md`「前置阻塞」                      | 与 Evolu 无关，但**它是 A4 的硬门**：`migration-release.json` 的 `bridge.tag` / `bridge.version` 当前均为 `null`，历史 `v0.0.25` 已被 squash 移出主线祖先。该阻塞**不随代码进度自动解除，必须单独排期**，否则 A4.1 一开工就卡住 |
| A4.1 | 提交图与 HEAD                        | `US-305`，High，Backlog；前置 A4.0                                                     | 当前项目已有 branch/commit 方向，应先把本地持久化语义做实，不要先换同步模型                                                                                                                                                     |
| A4.2 | 工作树/缓存区/提交操作               | `US-306`，固定依赖 `US-305`；阶段 A → B → C                                            | 对应当前项目的协作工作流，是 HLC 实验必须保护的现有 userspace                                                                                                                                                                   |
| A4.3 | 恢复会话与分支隔离冲突               | `US-307 ∥ US-308`，必须复用 `US-306` 冻结的 `useWorkingTree()` 契约和 benchmark target | 先把本地冲突、恢复和 branch 边界测清，再评估字段级远程合并                                                                                                                                                                      |

这里不能把 Evolu 的字段级 LWW 当作 `US-305/306` 的替代实现。requirements 已明确 `US-305` 只使用领域 `headRevision` CAS，不引入 writer lease 或迁移 epoch；这个边界应保持不变。

### A5：最后做 Evolu 同步内核实验

这部分当前不属于已完成的 `epic-002`，也没有现成 story，必须先立 RFC，再决定是否建新 epic：

| 阶段 | 活动                                                  | 前置条件                                      | 先验收什么                                                             |
| ---- | ----------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| A5.1 | `rxdb-sync-protocol` RFC：协议/transport/storage 分层 | A0、A1、A2 完成；现有 Supabase 行为有回归基线 | 明确 change、HLC、tombstone、字段粒度、RLS 和向后兼容边界              |
| A5.2 | HLC + 顶层字段合并实验插件                            | A5.1；不得改现有 LWW 默认路径                 | 乱序、重复、时间回拨、未来时间戳、原子合并组、undo/redo 和 branch 回归 |
| A5.3 | reconciliation benchmark                              | A5.2；先保留 `changeId` transport             | 10 万/100 万 change 下首次/增量对账、网络字节、索引空间和断线恢复数据  |
| A5.4 | SyncScope 与可选 blind-relay/E2EE 模式                | benchmark 证明需求；明确不替代 Supabase/RLS   | 密钥域、删除边界、权限边界和服务端查询能力都被文档化；没有场景就不实现 |

**停止条件**：如果现有 `changeId` 在目标规模、带宽和多 relay 场景下没有成为可测瓶颈，A5.3 之后停止；不为了“像 Evolu”而引入全量 CRDT。

### A6：暂缓的需求

以下 requirements 事项有价值，但与 Evolu 借鉴没有直接关系，除非产品数据证明其优先级，否则排在 A0–A5 之后：

- `US-208` Electron PGlite 数据目录与事务宿主：等桌面 SQLite host 契约稳定后再做。
- `US-703` PGlite 全文搜索：等 PGlite 搜索需求和跨框架 fixture 明确后做。
- `US-211` 多端小程序：先完成 host 可行性矩阵，不能扩大公开支持声明。
- `US-905` Tauri DevTools：遵循 `US-210 → US-505`，不独立抢占存储 host 的资源。

### 8.1 依赖图

```text
US-207 ─────┬─> US-210 ─> US-505 ─> US-905
            └─> US-904 阶段 D（Electron，另需 US-504）

US-013 ─> US-014 ─> US-015 阶段 A
             └─> US-016（待切片）

US-303（Done）─> property tests / US-018（独立）
US-601 可与 A2/A3 并行，但必须先于子路径公开 API 变化

新 bridge 发布（FR-030，需单独排期）─> US-305 ─> US-306 A ─> B ─> C ─> (US-307 ∥ US-308)

A0/A1/A2 ─> sync protocol RFC ─> HLC prototype ─> reconciliation benchmark
```

## 9. 推荐落地顺序（Evolu 专项）

> **本节从属于第 8 节，不是并行的第二套排期。** E0–E4 对应 A2/A3，E5–E8 对应 A5；
> 其中任何一项都不得早于 A0（桌面 host 收尾），E5 之后的全部工作还需满足 A5 的前置条件。
> 只看本节直接从 E0 开工会绕开 A0/A1 的真实交付。

| 阶段 | 工作                                  | 退出条件                                     |
| ---- | ------------------------------------- | -------------------------------------------- |
| E0   | 现有 change codec property-based test | 核心不变量覆盖，失败可复现为固定 seed        |
| E1   | 三框架真实消费者 bundle budget        | tree-shaking、条件导出、Brotli 阈值进入 CI   |
| E2   | TSDoc + website 示例执行              | 文档 API 漂移能在 CI 中失败                  |
| E3   | 可选 Standard Schema validator        | 不建立第二套 metadata，不破坏现有 API        |
| E4   | generator opt-in branded ID           | 主外键品牌一致，运行时格式不变               |
| E5   | `rxdb-sync-protocol` RFC              | 明确时钟、字段粒度、tombstone、兼容边界      |
| E6   | HLC + 顶层字段合并实验                | 乱序、重复、回拨、坏钟和 undo/redo 测试通过  |
| E7   | reconciliation benchmark              | 数据证明优于现有 `changeId` 后才进入实现     |
| E8   | SyncScope/E2EE 可选模式               | 与 Supabase RLS 模式并存，不取代现有 adapter |

当前 roadmap 的 P1 不应被一个“大一统 CRDT 重写”打断。同步协议研究必须作为独立 RFC 和实验插件推进，复杂度也不可能靠一次重构按时交付。

## 10. 代码评价

| 项目                         | 评价        | 原因                                                                       |
| ---------------------------- | ----------- | -------------------------------------------------------------------------- |
| HLC + 字段级合并             | 🟢 好       | 数据结构清晰，确定性强，解决真实离线冲突                                   |
| Storage/Protocol/Relay 分层  | 🟢 好       | 协议不依赖具体业务后端                                                     |
| 集合对账                     | 🟢 好但昂贵 | 扩展性强，复杂度和验证成本也高                                             |
| Standard Schema + branded ID | 🟢 好       | 低运行时成本，边界更安全                                                   |
| property-based 测试投入      | 🟢 性价比高 | 全仓仅一处 `fc.assert`，却覆盖了手写 fixture 到不了的组合空间              |
| 自研 Task/Type runtime       | 🟡 凑合     | 对 Evolu 自洽，对当前项目性价比低                                          |
| blind relay 作为唯一后端     | 🟡 场景化   | 隐私强，但牺牲服务端业务能力                                               |
| 源码与网站文档一致性         | 🔴 已漂移   | 构造签名、必填字段、mutation 返回值三处公开示例与当前 API 不一致（见 3.3） |

## 11. 最终判断

结合 requirements 后，真正的执行顺序是：

1. **A0 收尾进行中**：US-207/210/505 的共享桌面 host 与 US-904 的阶段化收口。
2. **A1 解生命周期**：US-013 → US-014 → US-015 阶段 A，并切片已有症状的 US-016。
3. **A2/A3 降低正确性和发布风险**：US-018、US-601、property test、bundle budget、可执行文档。
4. **A4 完成本地协作路线**：先发布新 bridge 版本解除 FR-030（不随代码进度自动解除），再 US-305 → US-306 → (US-307 ∥ US-308)。
5. **A5 再验证 Evolu 同步内核**：RFC → HLC 字段合并实验 → reconciliation benchmark → 可选 SyncScope/E2EE。

不要优先学习 Evolu 的大规模基础设施，也不要立刻引入全量 CRDT。先用测试和 benchmark 证明问题，再以独立插件演进同步协议，才能同时满足“好品味”和“Never break userspace”。
