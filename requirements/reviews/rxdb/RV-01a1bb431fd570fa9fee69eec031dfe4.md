---
id: RV-01a1bb431fd570fa9fee69eec031dfe4
title: 'None 无适配器覆盖在单条保存成功后被同类批量保存拒绝'
project: rxdb
branch: refs/heads/codex/full-review-main-20261108
range: project
base_ref: null
review_scopes: []
scope_id: 'project:rxdb'
status: Open
severity: P2
source_view: commit
source_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
base_sha: null
found_branch: refs/heads/codex/full-review-main-20261108
found_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
found_range: project
created: 2026-11-08
updated: 2026-11-08
anchors:
  - 'packages/rxdb/src/entity/primary-adapter.ts#resolveBatchPrimaryAdapter'
affected_projects: []
related_findings: []
pr: null
---

# RV-01a1bb431fd570fa9fee69eec031dfe4：None 无适配器覆盖在单条保存成功后被同类批量保存拒绝

## 问题与影响

数据库已注册本地 PGlite，业务实体通过公开支持的 syncOverrides 被覆盖成 {type:SyncType.None}，只阻止同步。该实体单条 save() 可以成功落本地，但 saveMany([同类新实体]) 却抛 No local adapter is configured；把同一实体与一个继承库级同步配置的普通实体放进同批又能成功。是否能保存取决于批次中有没有无关实体，违反单条和批量使用同一生效策略的契约。需要 None 的无适配器分支，定为 P2；失败显式抛出，未发现已写数据被损坏。

## 证据与根因

冻结快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`。

`packages/rxdb/src/entity/sync-options.interface.ts:98` 定义合法 SyncDisabled，None 时可不带两侧；`packages/rxdb/src/__tests__/entity/sync-override.spec.ts:530` 附近明确测试该覆盖可构造。该配置完全阻止推拉，不是删除库级本地适配器。

`packages/rxdb/src/entity/primary-adapter.ts:104` 至 122 行按每个实体的生效配置计算 selection，None 无适配器时得到 kind=local、selection=null。整批只有此类实体时找不到非 null 项并抛错；混入继承库级配置的实体后，selections.find() 则取那一项而放行同一无适配器实体。单条 Repository 的 primary$ 只按 selectPrimaryAdapterKind 选择已有的 rxdb.localAdapter$，所以相同实体可以单条保存。

真实 PGlite 内存后端、公共 RxDB 构造/connect 与 EntityManager 保存入口的有界复现：

1. 注册 DisabledBatchRow、RegularBatchRow；库级 None + local:pglite，给前者设置 syncOverrides={type:None}。
2. await new DisabledBatchRow({title:single}).save()，物理库有 single。
3. await saveMany([new DisabledBatchRow({title:batch-alone})])，抛 RxDBMissingPrimaryAdapterError，错误声称库级也没有本地适配器。
4. await saveMany([new DisabledBatchRow({title:mixed-disabled}),new RegularBatchRow({title:mixed-normal})]) 成功，物理 Disabled 表包含 mixed-disabled、single，没有 batch-alone。

复现使用现有构建的真实核心和 PGlite；没有替换主适配器选择器、仓库或事务。现有 primary-adapter.spec.ts 仅分别覆盖全缺配置和普通混主端；sync-override 的 None 无适配器用例只测构造，未比较单条/批量写入。

## 修复方向

明确 None 无侧配置的持久化选择，并让单条、纯同类批量、混合批量遵守同一规则；保留它完全不参与同步的语义。不能仅靠批次里第一个非空 selection 隐式决定其他实体。补本地已注册条件下三种保存形态的真实库回归，再核对 remote-only 根配置的拒绝行为。

## 处理记录

### EV-01a1bb431ffb7c84a00f30e0c31d48a6：发现

- 时间：2026-11-08T13:05:01.921Z
- 操作：review/full（parallel-001/core）
- 执行者：ai；provider、model、version、session 均为 unknown
- 输入快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`
- 输出快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`（仅写评审记录）
- 状态：未登记 → Open
- 结论：真实 PGlite 复现同一生效配置下单条成功、同类批量报错、混合批量又成功。
- 验证：`node <git-common-dir>/ai-review/v1/runs/full-main-20261108/parallel-001/core/repro-disabled-batch.mjs`，退出 0，输出 singleSaved=true、batchError=RxDBMissingPrimaryAdapterError、storedTitles=[mixed-disabled,single]；诊断断言确认缺陷仍在。未改业务代码或原测试。
- 剩余事项：补正式红灯回归、按 fix/verify 处理；继续全仓评审。
