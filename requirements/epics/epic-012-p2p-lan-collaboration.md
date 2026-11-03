---
id: epic-012-p2p-lan-collaboration
status: Backlog
startDate: TBD
targetDate: TBD
owner: jimmy
---

# P2P 会话与局域网协作

## 愿景

设备之间建立 P2P 会话之后，不只用来传文件：

- 同一用户的新设备能从局域网里的旧设备克隆整个库；
- 协作者能看到彼此在线、正在编辑什么；
- 开发者能检查另一台设备上的库；
- 需要时，由一台桌面应用充当局域网里的远端。

这些能力都不改变 RxDB「由一个排序者决定变更顺序」的同步内核。

## 为什么单列一个 Epic

- **越过了 epic-011 的非目标。** [epic-011](epic-011-p2p-file-share.md) 写明「不替换同步协议，P2P 只传大文件字节」。本 Epic 的克隆与枢纽直接搬运结构化数据，信号会触发同步动作，范围不同。
- **验收维度不同。** 每项能力都要证明没有破坏水位线、幂等推送与冲突语义（见下方约束），epic-011 没有这一维度。
- **共同前置在 epic-011 内。** 会话层 [US-708](../stories/future/US-708-p2p-peer-session.md) 修的是文件传输自身的缺陷，归 epic-011，在 PR #172 内完成。

## 同步内核给 P2P 定的约束

以下事实读源码确认，每项能力都按它们检查：

| 事实                                                                    | 出处                                                                                                                                                                             | 对 P2P 的约束                                                              |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 远端变更 id 由服务器统一分配；客户端按「实体 × 分支」记录拉取水位线     | [`RxDBAdapterRemoteBase.pullChanges`](../../packages/rxdb/src/rxdb-adapter.ts)；[`RxDBSync`](../../packages/rxdb/src/system/sync.ts) 的 `lastPullRemoteChangeId`                 | 设备之间没有共同的 id 空间，不能把对端当成「另一个服务器」去推拉同一份数据 |
| 拉到他人的变更时不写本地变更日志                                        | [`pullBatchOnce`](../../packages/rxdb-plugin-sync/src/pull-batch.ts)：`// disableTriggers=true 确保不生成本地 RxDBChange 记录`                                                   | 对端只有「当前数据 + 水位线」，没有可转发的服务器日志                      |
| 推送以 `(clientId, localId)` 防重；`clientId` 在实例初始化时生成        | [`RxDBAdapterRemoteBase.mergeChanges`](../../packages/rxdb/src/rxdb-adapter.ts) 的 remarks；[`RxDB`](../../packages/rxdb/src/RxDB.ts) 初始化时 `this.#context.clientId = uuid()` | 由别的设备代推，或从克隆出的库再推一次，都会形成重复变更                   |
| 冲突只与未推送的本地变更比较；只能自动应用 `KEEP_LOCAL` / `KEEP_REMOTE` | [`ConflictResolution`](../../packages/rxdb/src/sync-contract/conflict.ts)、[`LWWConflictResolver`](../../packages/rxdb/src/sync-contract/LWWConflictResolver.ts)                 | 没有多方合并能力，不能引入第二个排序者                                     |
| 读范围由服务端行级权限裁剪                                              | `docker/sql/03-business-tables.sql` 的 `rls_todos_select` 等策略                                                                                                                 | 只有可见范围相同的设备之间，才能拿对端的数据代替服务器                     |
| 推送是用户的显式动作                                                    | [`resumeSync`](../../packages/rxdb-plugin-sync/src/sync-listeners.ts) 的注释：「`push` 问的是『把我这条分支上攒的提交送到远端去』」                                              | P2P 不替用户自动推送                                                       |

由此得出三条规则：

- **R1 排序者唯一**：结构化数据的变更顺序只来自一个排序者——云端服务器，或明确指定的局域网枢纽。
- **R2 提示不是数据**：对端发来的实时消息只能触发「向排序者核实」，不直接写入本地库。
- **R3 数据只在可见范围相同的设备间传**：默认只限同一认证主体（`P2PPrincipal.principal`）的设备；跨用户需要排序者签名，或由枢纽执行授权。

## 目标

- [ ] 同一用户的新设备从局域网里自己的另一台设备克隆整库，之后照常向服务器增量同步（[US-709](../stories/future/US-709-p2p-database-clone.md)）
- [ ] 协作者看到彼此在线、正在编辑哪一条，并在局域网内及时得到变更提示（[US-710](../stories/future/US-710-p2p-live-signals.md)）
- [ ] 开发者经 P2P 会话检查另一台设备上的库（[US-711](../stories/future/US-711-p2p-remote-devtools.md)）
- [ ] 一台桌面应用充当局域网远端，其他设备用现有同步插件与它读写（[US-712](../stories/future/US-712-p2p-lan-hub.md)）

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [US-709 整库克隆：从局域网里自己的另一台设备克隆数据库](../stories/future/US-709-p2p-database-clone.md) (High)
- [US-710 实时信号：在线状态、编辑标记与变更提示](../stories/future/US-710-p2p-live-signals.md) (Medium)
- [US-711 远程 DevTools：经 P2P 会话检查另一台设备上的库](../stories/future/US-711-p2p-remote-devtools.md) (Low)
- [US-712 局域网枢纽：一台设备充当远端](../stories/future/US-712-p2p-lan-hub.md) (Medium)

## 包划分

- **会话层与传输**：在 `@aiao/rxdb-plugin-p2p` 的 `src/session/`，文件共享是同一个包里的一个协议（owner 决定，2026-11-04：单包）。带重依赖的能力（三框架绑定、DevTools、枢纽）另立包，依赖它。
- **各项能力**：放在插件包里，不新增核心包导出。核心包公开导出的命名门禁只放行 `Commit*` / `WorkingTree*` / `Worktree*` 前缀，见 `scripts/audit/api-surface.mjs`。
- **三框架绑定**：只有 US-710 需要 Angular / React / Vue 绑定，三端 API 对称。克隆、DevTools、枢纽是服务层，三端 demo 直接调用，同 [US-502](../stories/plugin/US-502-storage-plugin.md) 的做法。

## 非目标

- **无中心的多方同步**（CRDT、向量钟）：冲突按整条变更「后写的赢」，没有行级或字段级版本，多台设备互相同步不保证收敛。要做就得重写同步内核。
- **对端转发服务器的变更日志**：本地不保存他人的变更（见约束表）；要补存就得新加表，还会带来存储放大。
- **在设备间交换提交与分支**（git remote 式）：提交 id 由 `uuid()`（UUIDv7）生成，不是内容哈希；[`computeCommitContentFingerprint`](../../packages/rxdb-plugin-working-tree/src/commit/change-unit.ts) 以父提交的 id 而不是父指纹入摘要，不构成 Merkle 链。[epic-006](epic-006-working-tree-commits.md) 的愿景也明确不引入远程仓库。
- **只存在本地的实体在自己的设备间同步**：这类数据没有排序者，需要一套「行版本 + 删除标记」的新合并模型。
- **公网 P2P**：沿用 epic-011 的边界，不做 STUN/TURN 与 NAT 穿透。

## 价值待证

本 Epic 来自 owner 对「P2P 通道还能承载什么」的研究，尚无具名使用方踩到的具体症状。
按 [CONVENTIONS「价值待证」](../CONVENTIONS.md#价值待证)，四条故事都留在 Backlog 的立项池；各自的解锁信号写在故事的「解锁条件」节。

**排序（2026-11-03，owner 决定）**：会话层（US-708）之后先做 US-709。这只是次序，不是解锁；
解锁任何一条，都要在本节补一条解锁记录。
