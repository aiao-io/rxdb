---
id: RV-01a2118227af7d5285df5ce117507582
title: '升级后未转分区的实体，历史日志正文对任意登录用户持续可读'
project: 'rxdb-adapter-supabase'
status: Dismissed
severity: 'P1'
anchors:
  [
    'docker/sql/production/rxdb-change-grants.sql#rxdb_change_read_by_bucket',
    'docker/sql/02-rxdb-sync-functions.sql#rxdb_enable_sync_for_table'
  ]
affected_projects: []
related_findings: []
found_on_branch: 'refs/heads/supabase-log-access-baseline'
found_view: commit
found_snapshot: 'b739b164a7dec9093c2e27c124563fd99a250400'
found_range: project
found_base: null
created: 2026-11-25
updated: 2026-11-25
pr: null
---

# RV-01a2118227af7d5285df5ce117507582：升级后未转分区的实体，历史日志正文对任意登录用户持续可读

## 问题与影响

日志读策略 `rxdb_change_read_by_bucket` 第一分支放行「authenticated 且 bucket IS NULL」的全部未分区旧日志行；
升级脚本不再做任何历史正文清理（原「清理 DELETE」被移除，见下），清理只在实体登记为分区实体的那一刻发生（`rxdb_enable_sync_for_table`）。
一个实体只要不转分区，它升级前写下的 `patch` / `beforeData` / `afterData`（可能含敏感列）就对任意登录用户持续可读，
与 epic-015 定案「正文由业务表裁决、日志不带正文」相悖。

定 P1：真实的数据暴露面（任何登录用户可读历史正文），且无时间上限；不定 P0 是因为这是 US-225 收口前就存在的旧口径、
升级脚本注释明示为有意保留（旧客户端兼容、防重跑误删），可能被 owner 判定为可接受的过渡期设计——若是，应转 Accepted 并写明残留面。

## 证据与根因

快照 `b739b164a7dec9093c2e27c124563fd99a250400`：

- `docker/sql/production/rxdb-change-grants.sql:48-62`：`USING ((auth.role() = 'authenticated' AND bucket IS NULL) OR (bucket IS NOT NULL AND bucket = ANY(rxdb_caller_buckets())))`——第一分支即暴露面。
- `docker/sql/production/rxdb-sync-access-upgrade.sql:43-46`：原「清理历史正文」的 DELETE 已整体移除，仅剩注释说明升级时无实体登记为分区实体、旧日志仍按旧口径可读。
- `docker/sql/02-rxdb-sync-functions.sql:1004-1018`：`rxdb_enable_sync_for_table` 在实体转分区时 DELETE 未分区历史日志并把正文四列置 NULL——真正的清理只在这里发生，而迁移文档未要求对每个实体重登记。

触发：旧版生产库按迁移指南升级 → 未重新登记实体 → 历史敏感正文对任意 authenticated 可读，直到（若有）该实体转分区。

## 修复方向

二选一，由 owner 裁决：升级脚本无条件清掉无法归属分区的历史正文（在同一事务内），并在迁移文档写明这一步；
或接受为过渡期设计，把「未分区历史日志对 authenticated 可见、正文不清理、实体转分区时自动清理」写成迁移文档的显式已知限制（当前文档只说「旧日志对 authenticated 可见」，未写明正文残留与清理时机）。

## 处理记录

### EV-01a21194e72b7f79a6bd0a16c1d64dd7：发现

- 时间：2026-11-25T15:19:59+0800
- 操作：review/independent
- 执行者：ai；anthropic/claude-fable-5；会话 5812bc94-4aee-477d-b7b0-036b9c8fbed8
- 输入快照：`b739b164a7dec9093c2e27c124563fd99a250400`
- 输出快照：同输入
- 状态：未登记 → Open
- 结论：部分修复。源头是 2026-11-23 深度评审（随 WIP 提交删除）的第 5 条「清理是空操作」——空操作代码已删除、清理挪进 `rxdb_enable_sync_for_table` 且真正生效；
  残留为未转分区实体的历史正文持续可读，属有意保留但暴露面无时间上限。
- 验证：4 个独立验证 agent 在 HEAD 上对抗性核对（工作流 wf_fbd47c66-d14），主会话对 `rxdb-change-grants.sql:48-62` 策略文本做行级复核；未运行测试与真栈回归，结论基于静态证据。
- 剩余事项：owner 裁决修复或 Accepted；若保留，迁移文档补正文残留与清理时机的说明。

### EV-01a211cfe22c78e5a4238ac877b3a4a0：复核（方案层，2026-11-25 批次 8/9 授权后）

- 时间：2026-11-25T16:26:06+0800
- 操作：review/independent
- 执行者：ai；anthropic/claude-fable-5；会话 5812bc94-4aee-477d-b7b0-036b9c8fbed8
- 输入快照：`0c53cb30dc05a53483e1a5f8a9f647d82f4029d7`
- 输出快照：同输入（只写评审记录）
- 状态：Open（不变）
- 结论：本轮的 requirements 更新（US-229「Supabase 远端变更历史」）把本记录描述的暴露面引为动机之一（US-229 现状第 2 点：未分区日志正文对全部登录用户可读、算不上受控的历史），
  但明确 Out of Scope「同步日志的规则：未分区日志保持现状」，历史表只记新写入、不回填。本记录提出的两个修复方向（清理或转 Accepted 并写明残留）均未被采纳，
  owner 裁决仍未出现；P1 暴露面在 US-229 落地后依旧存在，只是多了一条受控的替代通道。
- 验证：文档评审工作流 wf_9f752545-f43（3 读者 + 1 评审）交叉核对，主会话复核 `US-229-supabase-change-history.md` 全文与 epic-015「变更历史与同步日志分开」定案；未运行测试，结论基于静态证据。
- 剩余事项：不变——owner 裁决修复或 Accepted。

### EV-01a21224d4eb73eabe7c936e7ad86023：复核（不成立）

- 时间：2026-11-25T18:02:16+0800
- 操作：review/independent
- 执行者：ai；anthropic/claude-opus-5-5；会话 8b131c28-0801-4140-925f-c944249ee3cf
- 输入快照：`45114a4aa36d2649ce281855e4beac56c6d7000c`
- 输出快照：工作区树 `00a3a6eab9aa449d8b213f7ee822858bc8048fab`（顺带补了两处文档措辞，见下；`ai-review snapshot --worktree`，基于 `b1fcba9b`）；本记录不在该树内。
- 状态：Open → Dismissed
- 结论：不构成所述的数据暴露面：
  - 未分区实体升级之后的新写入同样带完整正文进日志：`docker/sql/02-rxdb-sync-functions.sql:99`（INSERT）、`:152`（UPDATE）、`:171`（DELETE）在业务表没有 `rxdb_bucket` 列时照写 `patch` / `beforeData` / `afterData`，`bucket` 为 NULL，读策略第一分支对 authenticated 放行。历史正文与新写入的读者范围相同，删掉历史不减少任何暴露；
  - 升级脚本不删有它的理由：删了会让还没拉到最新变更的旧客户端永久漏掉它们（`docker/sql/production/rxdb-sync-access-upgrade.sql:43-46`）；真正要收紧时就把实体改成分区实体，登记函数会删掉它全部未分区历史（`docker/sql/02-rxdb-sync-functions.sql:1004-1018`）；
  - 评审称迁移文档「只说旧日志对 authenticated 可见，未写明正文残留与清理时机」与事实不符：`website/docs/migration/supabase-sync-access.md:108` 原文「登记会删掉这个实体全部的未分区历史日志。这些旧日志带完整正文，登记之前仍按旧口径对 authenticated 可读」；`:23` 与适配器文档「适用边界」（`website/docs/adapters/supabase.md:674`）写明未分区日志对全部登录者可读、需要租户隔离的实体应改用按区日志同步；
  - epic-015「正文由业务表裁决」说的是分区日志（`requirements/epics/epic-015-identity-scoped-sync.md:31`「分区日志只记哪个区的哪一行变了，不存行内容」），不约束未分区日志；
  - 与 main 比，本分支是收紧：main 上 `rxdb_change` 对 anon 与 authenticated 都可读（`git show main:docker/sql/production/rxdb-change-grants.sql` 第 17 行 `GRANT SELECT ON public.rxdb_change TO anon, authenticated`），现在 anon 只能读授权的分区；
  - 顺带：两处文档的「未分区旧日志」容易被读成「只剩升级前的存量」，已在迁移文档 `:23` 与适配器文档 `:674` 补明「带完整正文，没有改成分区实体的实体之后的新写入同样记成这种日志」。术语本身沿用，SQL 注释不动。
- 验证：静态阅读上述 SQL 与文档；`node scripts/check-doc-code.mjs` 0 个错误，两份文档 prettier 通过。
- 剩余事项：无。若 owner 想让未分区实体的日志也不带正文，那是改未分区协议本身（US-229 范围以外），另立故事。
