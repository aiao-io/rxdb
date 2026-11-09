# LiveStore 竞品调研与后续决策依据

> 调研日期：2026-11-10。范围：LiveStore 官方仓库、0.5.0 文档与当前 RxDB main 对照。
> 本文记录功能差异、可借鉴方向、最小验证和边界；不创建用户故事，不代表排期或交付承诺。
> LiveStore 的当前状态、稳定性和未完成项以其官方文档为准，后续立项时需要重新核对版本。

## 结论

**✅ 值得借鉴，但不建议把 RxDB 改造成 LiveStore。**

LiveStore 的核心心智模型是：

```text
事件日志 → SQLite 投影 → 响应式查询 → 事件同步
```

RxDB 当前的核心模型是：

```text
实体 / 关系模型 → 本地数据库 → Repository / 响应式查询 → 可插拔同步、历史与插件
```

LiveStore 的优势是事件日志、投影重建、同步协议和文档路径高度统一；RxDB 的优势是实体关系、树、图、QueryCache、历史分支、三框架和多宿主适配器。

建议的方向是给 RxDB 增加**可选的事件原生模式**，让事件日志成为某些应用的事实源，同时保留实体模型作为默认入口。首批应先做协议与重放验证，再决定是否进入公共包和故事。

## 现有能力对照

| 维度 | LiveStore 当前能力 | RxDB 当前能力 | 判断 |
| --- | --- | --- | --- |
| 事实源 | 不可变、按顺序排列的事件日志；SQLite 是投影 | 实体数据是主模型；`RxDBChange` 是行级变更日志 | LiveStore 的审计、重放和故障重现更自然 |
| 写模型 / 读模型 | 事件定义与 SQLite 表、materializer、查询分开声明 | `@Entity` 统一生成表、类型、Repository、关系和查询入口 | RxDB 更适合传统业务与复杂关系 |
| 查询 | 内置查询构建器 + 任意 SQLite SQL；结果响应式更新 | 类型化实体查询、Observable、游标、树查询、图查询、全文搜索 | LiveStore SQL 能力更直接，RxDB 业务语义更强 |
| 本地存储 | 内存 SQLite + 持久 SQLite；Web 主要依赖 OPFS、Worker 和 SharedWorker | wa-sqlite、sqlite-wasm、官方 SQLite、SQLiteAI、PGlite、Electron、Tauri、小程序等 | RxDB 的运行时覆盖更广 |
| 同步 | 事件 push/pull；服务端维持全局总序；客户端对 pending events 做 rebase | `Full`、`Filter`、`QueryCache`；`syncManager` 连接 Supabase、HTTP 等适配器 | LiveStore 协议更统一；RxDB 更适合远端行模型 |
| 冲突 | 默认 LWW；上游事件到达后回滚并重放本地 pending events | 默认按时间戳 LWW，支持 `KEEP_LOCAL` / `KEEP_REMOTE` resolver | RxDB 已有明确的行级冲突入口；两边都没有完整的语义合并队列 |
| 语义合并 | 同步文档明确写着 merge conflict handling 尚未实现 | `MERGE` / `DEFER` 当前会抛错，避免静默丢数据，但没有持久化待处理冲突 | 不应把 LiveStore 的 rebase 当成领域合并 |
| 历史与版本 | 有版本控制方向；Undo/Redo 与版本控制示例仍是 TODO | 历史、Undo/Redo、分支、分支对比、合并预览、工作树、回放 | RxDB 明显领先 |
| 迁移 | SQLite schema 变化后从 eventlog 重建投影；支持分批重建和未知事件策略 | 显式 `up/down` migration、系统迁移水位、约束漂移检查、能力水位 | LiveStore 的投影迁移轻；RxDB 对既有数据库更可控 |
| 框架 | React / Solid 包；Vue beta；另有 Svelte 和 Custom Elements 集成文档 | Angular / React / Vue 三端 API 与插件绑定 | RxDB 的三框架对称是差异化优势 |
| 平台 | Web、Expo、Node 已有文档和包；Electron / Tauri 仍在扩展 | Web、Electron、Tauri、PWA、小程序、Node、PGlite 等 | RxDB 更适合已有多宿主矩阵 |
| 同步后端 | Cloudflare Durable Objects、ElectricSQL、S2、可自定义 provider | Supabase、HTTP、P2P 及多种本地适配器 | LiveStore 的 Cloudflare 参考实现更完整 |
| DevTools | 事件日志、查询检查器、SQLite playground、同步状态、导入导出、响应式图 | 事件、数据库、分支、OPFS、存储与安全序列化 | RxDB 应补查询和同步诊断面板 |
| 产品边界 | 不适合已有数据库、高连接度社交业务、完全去中心化 P2P | 支持已有远端数据、QueryCache、树、图、P2P、复杂关系 | 两者应保持不同定位 |

RxDB 当前事实入口见[能力矩阵](capability-matrix.md)、[模型定义](../website/docs/model-definition/README.md)、[同步策略](../website/docs/collaboration/sync.md)、[历史插件](../website/docs/plugins/rxdb-plugin-history/README.md)、[适配器文档](../website/docs/adapters/README.md)和[DevTools 文档](../website/docs/devtools/README.md)。

## LiveStore 的已验证优势

### 1. 事件日志把写入、同步、审计和重建串成一条路径

LiveStore 的事件包含事件名、参数、全局序号、父序号、客户端和会话信息。客户端提交事件后，事件先写入本地日志，再由 materializer 更新 SQLite；远端同步的也是事件，不是状态表。

这带来三个直接收益：

- 同一份事件流可以重建不同的读模型；
- 调试时可以看到“谁在什么时候提交了什么”；
- 同步冲突可以先处理事件顺序，再重放状态。

RxDB 的 `RxDBChange` 已经保存了变更和反向补丁，但它表达的是行变化，不一定表达业务意图。例如“把任务移动到下一列”与“更新 `columnId`”在行日志里相同，在事件日志里可以是不同的领域事件。

### 2. 全局总序和 rebase 规则容易解释

LiveStore 要求客户端先 pull 上游事件，再 push 本地事件。上游推进时，客户端回滚分叉后的 pending events，将它们重新挂到新的上游 head 上，再继续推送。

这不是完整的语义冲突合并，但它保证了同一事件序列最终落到同一状态，协议边界比“每个远端适配器各自实现一套合并逻辑”清楚。

### 3. 投影重建和未知事件策略已经产品化

LiveStore 的 schema 变化会新建 state DB 并重放 eventlog，支持重建批次大小、失败恢复和未知事件的 `warn`、`ignore`、`fail`、`callback` 策略。事件名也建议使用版本前缀，例如 `v1.TodoCreated`。

这套规则适合解决“客户端版本并行发布”和“读模型随产品演进”的问题。

### 4. 首条开发路径和边界说明清楚

LiveStore 文档同时说明了：什么时候适合使用、什么时候不适合、如何部署 Cloudflare、如何调试、如何做生产检查。它还明确写出 beta 状态、存储格式变更、内存 SQLite 容量和并发范围，降低了误用风险。

## 建议借鉴方向

### P0：事件原生模式，先做插件和 conformance suite

建议新增候选包 `@aiao/rxdb-plugin-eventlog`，但暂不替换实体模型。最小 API 可以围绕以下概念设计：

```ts
const events = {
  todoCreated: event('v1.TodoCreated', Schema.Struct({ id: Schema.String, text: Schema.String }))
}

const materializers = {
  'v1.TodoCreated': ({ id, text }) => tables.todos.insert({ id, text })
}

store.commit(events.todoCreated({ id, text }))
```

首批必须验证：

- 事件定义、编码、版本和未知事件策略；
- 事件与投影写入的原子性；
- 同一 eventlog 重放得到相同快照；
- pending event rebase、重复提交和断线重试；
- eventlog 导出、导入、恢复和清理边界；
- 与现有实体、历史、加密字段和 DevTools 的关系；
- Angular / React / Vue 是否需要对称绑定，还是先提供框架无关 API。

这一步通过后，再决定是否支持事件驱动同步和云端事件存储。

### P0：统一同步后端契约

抽象一份框架无关的 `SyncBackend` 契约，统一描述：

- `clientId`、`sessionId` 和 `storeId`；
- upstream head、cursor 和 backend identity；
- ordered pull、serialized push 和 live-pull 通知；
- 重试、幂等、backend reset 和 rebase；
- 认证、授权和服务端 payload 校验。

现有 Supabase / HTTP 行同步继续兼容，事件同步作为新模式接入。先写后端 conformance suite，再接 Cloudflare、Node 测试后端和现有远端适配器。

### P1：投影重建和 schema evolution

把 LiveStore 的几个可复用规则引入事件插件：

- 事件定义使用版本前缀；
- 只允许向前兼容的事件参数变化；
- projection schema 变化自动重建；
- 重建按事件批量提交；
- 中断后丢弃未完成投影并重试；
- 未知事件策略集中配置；
- 重建状态和失败原因暴露给框架层和 DevTools。

这不能替代 RxDB 现有 migration。普通实体继续使用显式 migration，事件模式使用 replay-based migration。

### P1：补齐同步调试能力

在现有 DevTools 上增加：

- eventlog 浏览器；
- push / pull / rebase 时间线；
- 查询检查器和 SQL playground；
- sync cursor、backend head、pending count 和 last error；
- state DB / eventlog 导入导出；
- OpenTelemetry trace 入口。

基础查看能力继续保持开源；托管同步诊断或团队审计能力可以另行评估。

### P1：复制 LiveStore 的文档组织方式

新增一页竞品和选型说明，明确：

- RxDB、LiveStore、Electric、Zero、PowerSync 各自的事实源；
- 适合已有远端数据库还是新建事件系统；
- Full、Filter、QueryCache、EventLog 的选择条件；
- 历史、分支、工作树和同步的边界；
- Web、桌面、小程序和移动端的适配器限制。

同时提供一个带本地 SQLite、一个带 Supabase、一个带 QueryCache 的最小示例。CLI 生成器可以后置，先把模板和接入步骤固定下来。

### P2：评估 Cloudflare 和 Expo 适配器

如果目标用户需要边缘部署或 React Native，再单独评估：

- Durable Object 按 `storeId` 路由；
- DO SQLite / D1 事件存储；
- WebSocket、HTTP polling 和重连；
- Expo SQLite 的 state DB 与 eventlog DB；
- 与 RxDB 现有行同步和权限模型的组合方式。

这两项不能仅因为 LiveStore 已有文档就直接进入排期，必须先有目标用户、真实部署场景和宿主验收。

## 不建议照搬的部分

1. **不把事件溯源变成所有应用的唯一模型。** LiveStore 自己也把已有数据库、高连接度社交业务和完全去中心化 P2P 列为不适合场景。RxDB 的实体关系、树、图和 QueryCache 仍应作为默认优势。
2. **不把总序 rebase 宣称为领域冲突解决。** LiveStore 当前同步文档明确写着 semantic merge 尚未实现。富文本、多人细粒度编辑和复杂业务规则仍需要 CRDT 或领域 resolver。
3. **不只押注 OPFS 和中心同步。** RxDB 的 Electron、Tauri、小程序、PGlite、Supabase、HTTP 和 P2P 组合是重要差异化。
4. **不把 client document 等同于业务实体。** UI 草稿、客户端状态、工作树和业务数据的持久化、同步、历史语义不同，必须分别定义。

## 最小验证顺序

| 顺序 | 验证项 | 最小结果 | 未通过时的处理 |
| --- | --- | --- | --- |
| 1 | 事件提交与投影 | 断电 / 回滚后事件和投影保持一致 | 不进入同步设计 |
| 2 | 事件重放 | 同一日志在至少两个本地适配器上得到相同快照 | 先修事件编码和后端差异 |
| 3 | rebase 与重试 | 两客户端离线写入、交错 pull/push 后收敛 | 不宣称协作完成 |
| 4 | schema evolution | 新旧事件并行、未知事件和投影重建可恢复 | 只保留实验性 API |
| 5 | DevTools 诊断 | 能定位一条事件从提交到同步失败的完整链路 | 不扩大公共 API |
| 6 | 三框架消费 | Angular / React / Vue 至少完成同一框架无关核心的读取和提交验证 | 事件模式继续保持框架无关 |

测试仍需遵守现有核心包 90%、其他包 80% 覆盖率门禁；事件模式应额外提供跨适配器、跨框架和重放一致性套件。

## 当前边界与风险

LiveStore 官方项目当前为 beta，文档说明 minor release 仍可能包含 API 或本地存储格式破坏性变化，暂无明确 1.0 时间表。其 Web 适配器主要依赖 OPFS，官方建议应用数据适合放入内存 SQLite；同步场景主要面向同一 eventlog 上的几十到低几百并发用户。它的语义冲突合并、eventlog compaction、多 eventlog 分区和部分框架 / 平台支持仍在演进。

因此本文只把 LiveStore 的事件建模、同步协议、投影重建和开发工具当作学习对象，不把其 beta 状态下的未完成能力写入 RxDB 的交付承诺。

## 后续决策入口

1. 先由 owner 确认是否需要事件原生模式；没有真实审计、可重放、AI agent 或协作场景，不开公共包。
2. 若确认，按 [CONVENTIONS](CONVENTIONS.md) 新建 story，写清事件格式、迁移策略、同步后端和三框架边界。
3. 将协议 conformance、重放一致性和故障恢复列为准入条件，不以 Todo demo 代替验证。
4. 事件模式与其 `packages/*` 公共包改动按 [AGENTS.md](../AGENTS.md) 一起评审、验证和合入。

## 来源与复核方式

| 编号 | 官方来源 | 核对内容 |
| --- | --- | --- |
| L01 | [LiveStore GitHub 仓库](https://github.com/livestorejs/livestore) | 项目定位、README 能力清单、当前主分支公开状态 |
| L02 | [How LiveStore works](https://docs.livestore.dev/overview/how-livestore-works/) | event sourcing、SQLite 投影、push/pull、rebase、LWW |
| L03 | [When to use LiveStore](https://docs.livestore.dev/overview/when-livestore/) | 适用场景、已有数据库边界、容量与并发考虑 |
| L04 | [Technology comparison](https://docs.livestore.dev/overview/technology-comparison/) | 与状态管理、BaaS 和既有数据库同步方案的定位差异 |
| L05 | [Events](https://docs.livestore.dev/building-with-livestore/events/) | 事件定义、版本、client-only、事件流和事件格式 |
| L06 | [Syncing](https://docs.livestore.dev/building-with-livestore/syncing/) | 总序、cursor、head、rebase、backend reset、未完成语义合并 |
| L07 | [SQLite state schema](https://docs.livestore.dev/building-with-livestore/state/sqlite-schema/) | 表定义、materializer、schema migration、state rebuild |
| L08 | [SQL queries](https://docs.livestore.dev/building-with-livestore/state/sql-queries/) | 查询构建器、原生 SQL、结果 schema和性能边界 |
| L09 | [DevTools](https://docs.livestore.dev/building-with-livestore/devtools/) | 数据浏览、eventlog、查询检查器、SQLite playground、导入导出 |
| L10 | [Cloudflare Workers](https://docs.livestore.dev/sync-providers/cloudflare/) | Durable Objects、DO SQLite / D1、WebSocket / HTTP transport |
| L11 | [Web adapter](https://docs.livestore.dev/platform-adapters/web-adapter/) | OPFS、Worker、SharedWorker、浏览器和 bundle 边界 |
| L12 | [State of the project](https://docs.livestore.dev/misc/state-of-the-project/) | beta 状态、破坏性变化、路线图和未完成平台 |

后续立项前，应重新核对 LiveStore 文档版本、npm 包能力和实际运行行为；本文不以宣传页或单个 demo 推导性能、可靠性或生产适用性。
