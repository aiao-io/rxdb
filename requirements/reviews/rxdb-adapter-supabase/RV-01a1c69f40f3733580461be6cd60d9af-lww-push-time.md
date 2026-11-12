---
id: RV-01a1c69f40f3733580461be6cd60d9af
title: '推送把日志 createdAt 改写成推送时刻，LWW 拿它比本机编辑时刻，离线晚推送的一方压过别人更晚的编辑'
project: 'rxdb-adapter-supabase'
status: Fixed
severity: 'P1'
anchors:
  [
    'packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts#build_merge_changes_payload',
    'packages/rxdb/src/sync-contract/LWWConflictResolver.ts#LWWConflictResolver',
    'website/docs/collaboration/sync.md'
  ]
affected_projects: ['rxdb', 'rxdb-plugin-sync']
related_findings: []
found_on_branch: 'refs/heads/live-store'
found_view: commit
found_snapshot: '6e03381dea405b988f09cf5ca2769e016b196707'
found_range: project
found_base: null
created: 2026-11-10
updated: 2026-11-11
pr: null
---

# RV-01a1c69f40f3733580461be6cd60d9af：推送把日志 createdAt 改写成推送时刻，LWW 拿它比本机编辑时刻，离线晚推送的一方压过别人更晚的编辑

## 问题与影响

A、B 两端改同一个实体：A 离线编辑，B 随后编辑且未推送，A 之后才推送。B 拉取时冲突，默认的 LWW 比较本机待推变更的编辑时刻与远端日志的 `createdAt`，
而后者是 A 的推送时刻，于是 B 更晚的编辑被判负并标为已被远端覆盖，两端收敛到 A 那条更早的编辑。
[同步策略](../../../website/docs/collaboration/sync.md)写的却是「较新的修改获胜」，同一节「时间戳相等时本地修改优先」也与代码不符（代码按 `clientId` 字典序决胜）。

定 P1：两端离线编辑同一实体是常见的同步场景，结果是更新的编辑被静默覆盖。不定 P0，是因为它只在两端都改了同一实体时才触发，
被覆盖的一方会收到 `ConflictDetectedEvent`，本地变更行也留着。

## 证据与根因

快照 `6e03381dea405b988f09cf5ca2769e016b196707`：

- `packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts:70`：`const now = new Date().toISOString();`，`:95` 把每条待推变更的 `createdAt` 写成 `now`；
  调用方 `packages/rxdb-plugin-sync/src/push-repository.ts` 传进来的源变更带着原始的 `createdAt`，被这里丢掉。
- `docker/sql/04-rxdb-utils-functions.sql:785`：`rxdb_insert_changes` 原样落库，拉取时原样读回。
- `packages/rxdb-plugin-sync/src/pull-conflict-utils.ts:222`：冲突的本地一侧取该实体最后一条未推送变更，`createdAt` 是本机写入时刻。
- `packages/rxdb/src/sync-contract/LWWConflictResolver.ts:39`：比较两侧 `createdAt`，两种时间混在一起比。
- `website/docs/collaboration/sync.md:113`、`:114`：文档描述与代码不符。

复现：真栈用例 `packages/rxdb-adapter-supabase/src/__tests__/conflict-time-semantics.spec.ts`，A、B 两个独立的 RxDB 实例（各自内存 wa-sqlite）连同一个 Supabase。
A 编辑 `14:21:53.544Z`、B 编辑 `53.597Z`、A 推送 `53.648Z`，远端日志记成 `53.651Z`；B 拉取后 `conflictsResolved = 1`，title 是 A 的编辑。

## 修复方向

推送时保留变更自己的编辑时刻，推送时刻记在 `updatedAt`，LWW 两侧比的就是同一种时间。不改 LWW 规则本身：
同步冲突的方向是 git 式合并、由用户裁决（见 `requirements/livestore-research.md` 的结论表），不为 LWW 投入新的时钟方案。

一起核对：除 LWW 外有没有代码读远端日志的 `createdAt`；文档与 TSDoc 的描述。

## 处理记录

### EV-01a1c69f416271799308729ab5969dc5：发现

- 时间：2026-11-10T22:21:53+08:00
- 操作：review/independent
- 执行者：ai；anthropic/claude-opus-5-5；会话 9fbd9033-c708-4a79-be9b-164eaafe7a0f（按 LiveStore 调研的 P0「核实现行冲突裁决的时间语义」做最小验证）
- 输入快照：`6e03381dea405b988f09cf5ca2769e016b196707`
- 输出快照：同输入（只加了用例）
- 状态：未登记 → Open
- 结论：成立。远端日志的 `createdAt` 是推送方的推送时刻，LWW 拿它比本机的编辑时刻。
- 验证：`pnpm nx test rxdb-adapter-supabase -- src/__tests__/conflict-time-semantics.spec.ts --coverage.enabled=false`，
  按文档语义断言 B 胜出，失败：`Expected: "…-edited-by-b-later"`、`Received: "…-edited-by-a-offline"`。
- 剩余事项：owner 在调研文档的三个选项里拍板。

### EV-01a1c69f41ba7bc18c2ee1d409b60c62：修复

- 时间：2026-11-11T02:23:43+08:00
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 9fbd9033-c708-4a79-be9b-164eaafe7a0f
- 输入快照：`6e03381dea405b988f09cf5ca2769e016b196707`（提交视图）
- 输出快照：工作区树 `c888269cfc70f80441395b67bfb99507007d15cd`（`ai-review snapshot --worktree`，基于 `6e03381d`）；本记录与之后的文档改动不在该树内。
- 状态：Open → Fixed
- 结论：owner 选「推送时保留原始 `createdAt`」。
- 改动：
  - `packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts`：传了 `changes` 时日志的 `createdAt` 取变更自己的编辑时刻，`updatedAt` 记推送时刻；只传 `actions` 时两列仍是推送时刻；
  - 回归：`conflict-time-semantics.spec.ts` 断言远端 `createdAt` 等于 A 的编辑时刻、`updatedAt` 不早于推送开始，B 胜出后推送、A 再拉取，两端与远端行都收敛到 B；
    `review-regressions.spec.ts` 在载荷层断言两列的取值（夹具补上了必填的 `createdAt`）；
  - TSDoc：`LWWConflictResolver`、`IRxDBChange.createdAt` / `updatedAt` 写明两种时间；
  - 文档：`website/docs/collaboration/sync.md` 冲突解决一节（编辑时刻、`clientId` 决胜、时钟漂移），自定义解决器示例不再比较 `updatedAt`；
    `website/docs/adapters/supabase.md` 变更追踪一节；`CHANGELOG.md`。
- 验证：
  - 修复前红：见发现事件；
  - 修复后：上述两个用例通过；`pnpm nx test rxdb-adapter-supabase --skip-nx-cache` 全量 46 个文件 664 条通过（其中一条载荷夹具缺 `createdAt`，补上后单跑通过）；
    `pnpm nx run-many -t lint typecheck` 覆盖本次改动的包，全部通过。
- 剩余事项：
  - 复核（verify）；
  - 新旧客户端混用期间，旧客户端推送的日志仍是推送时刻；
  - 跨设备时钟漂移仍会影响 LWW，冲突中心按调研文档的 P1 立项。
