# Quickstart: US-218 验证指南

**Plan**: [plan.md](plan.md) | **Contracts**: [push-integrity](contracts/push-integrity.md)、
[rxdb-mutations-receipts](contracts/rxdb-mutations-receipts.md)、[remote-merge-result](contracts/remote-merge-result.md)、
[sync-rejections-api](contracts/sync-rejections-api.md)、[rxdb-change-permissions](contracts/rxdb-change-permissions.md)

本文件只列验证步骤与期望结果；用例实现写在 tasks 阶段。所有命令在仓库根目录执行。前置环境与重新加载参考 SQL 的命令同
[006 quickstart §0](../006-us220-update-push-semantics/quickstart.md)。阶段 B / C 的验证以 US-220 已合入为前提。

## 阶段 A

### A1. SQL 回归（AC#1～7）

```bash
bash packages/rxdb-adapter-supabase/src/__tests__/run-supabase-sql-security-regressions.sh
```

期望：全部 `🟢 PASS`——既有 9 条 + US-220 的 6 条 + 改写的 `rls-filtered-delete` + 本阶段新增 4 条，共 20 条。用例与期望见
[push-integrity §4](contracts/push-integrity.md)。

**先红**：实现之前跑，`rls-filtered-delete`（改写后）与 `delete-hidden-row` 期望 42501 但今天成功且写了幽灵日志；`mixed-batch-rollback`
今天新建那条会落库；`push-integrity` 的五种不配对今天全部成功。`delete-gone` 的 ①② 今天即绿（护栏）；AC#3 由 US-220 的 `update-denied` 覆盖。

PR 描述贴脚本实跑输出（FR-027）。

### A2. 发布前抽查

阶段 A 与阶段 B 同版本发布（research D4）：阶段 A 的 PR 合入后不单独发版，`requirements/release-plan.md` 标注。

## 阶段 B

### B1. SQL 回归（逐实体回执）

新增用例（同一脚本）：

| 用例                    | AC     | 期望                                                                                                                                                            |
| ----------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `receipts-partial`      | 8、9   | `p_receipts = true`：1 条被拒删除 + 2 条可放行新建 → 成功；`entity_results` 3 条，1 条 `rejected` `42501`；两条新建落库并在 `change_id_mapping`；被拒那条无日志 |
| `receipts-fanout`       | 10     | 同一实体 3 条 main 源变更压成 1 次被拒写 → 回执 `localIds` 含 3 个                                                                                              |
| `receipts-dependency`   | 12     | 父新建被拒 + 子新建引用父 → 父 `denied`、子 `dependency`，`dependsOn` 指向父；同批无关实体生效                                                                  |
| `receipts-gone`         | 13     | 修改已不存在的行 → `rejected` `RX001` `gone`                                                                                                                    |
| `receipts-unclassified` | 13     | 23505 唯一冲突 → 整批失败，SQLSTATE 原样                                                                                                                        |
| `receipts-idempotent`   | 15     | 同一批调两次：第二次不执行业务写、`change_id_mapping` 远端 id 相同；首次被拒的实体在放开策略后重试变为 `applied`                                                |
| `receipts-legacy`       | FR-022 | 不传 `p_receipts`：任一条被拒整批 42501，无 `entity_results`                                                                                                    |
| `receipts-many-groups`  | —      | 70 个组各含 1 条被拒 → 成功，不触发子事务溢出                                                                                                                   |

### B2. 单元测试

```bash
pnpm nx run-many -t test --projects=rxdb,rxdb-plugin-sync,rxdb-plugin-history,rxdb-adapter-supabase,rxdb-adapter-sqlite-wasm,rxdb-adapter-pglite
pnpm nx run-many -t test --projects=rxdb-angular,rxdb-react,rxdb-vue
```

期望：

- `push-repository.spec.ts`：部分被拒时 `applied` 拿到 `remoteId`、被拒标 `rejectedAt` / `rejection`，水位线越过两者（AC#8、9）；
  扇出（AC#10）；对齐覆盖 / 移除且不产生 `RxDBChange`、不进撤销栈（AC#11）；回执缺项 / 重复 / 多余 → 整轮失败、水位线不动（AC#14）；
  `findByIds` 失败 → 不提交；被拒实体有更新的待推变更 → 不对齐。
- 「待推」口径：research D13 列表中每个查询各一条「被拒变更不计入」断言。
- Supabase 适配器：回执构造（applied / rejected / 缺项抛 `SupabaseDataError`）；`SupabaseDataError.code` / `details` 保留；
  网络错误、5xx 不进回执（AC#13）。
- 系统模式迁移：`migration.spec.ts` 版本 7，旧库升级后两列存在、旧行为空（FR-021）。
- `sync-state.spec.ts` 与三框架 `use-sync-state.spec.ts`：`lastRejections` 上报、保留、替换（AC#16）。

### B3. 真实链路

```bash
pnpm nx test rxdb-adapter-supabase -- push-receipts
```

期望：两个登录用户；用户 B 本地删除用户 A 的行并改自己的行 → 推送 → 自己的修改生效，删除被拒、本地该行恢复为远端值；第二轮推送不重发；
`syncState.snapshot.lastRejections` 有 1 条 `denied`。spec 记录单批耗时（SC-009）。

### B4. e2e（AC#16）

```bash
pnpm nx run dev-rxdb-supabase-e2e:e2e-remote
pnpm nx run dev-rxdb-react-e2e:e2e
pnpm nx run dev-rxdb-vue-e2e:e2e
```

期望：Supabase demo 触发真实 RLS 拒绝后面板列出被拒实体、操作与原因；React / Vue demo 面板空态可见、a11y 无新增违规；
三端面板组件 spec 用同一份夹具渲染出相同字段（spec US5「批准的偏离」）。

### B5. 版本组合（FR-022）

| 组合                   | 做法                                                 | 期望                                               |
| ---------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| 旧客户端 + 阶段 B SQL  | B1 的 `receipts-legacy` 覆盖                         | 全有或全无                                         |
| 阶段 B 客户端 + 旧 SQL | 加载 US-220 版 `04-rxdb-utils-functions.sql` 后跑 B3 | `SupabaseDataError`，含 `PGRST202`；本地变更仍待推 |

验证后重新加载新版 SQL。

### B6. API 基线与迁移文档

```bash
pnpm audit:api-surface
```

期望：差异只有 contracts 列出的新增 / 删除导出；运行 `pnpm audit:api-surface:update` 更新基线。
`website/docs/migration/supabase-push-receipts.md` 已在 `website/docs/migration/README.md` 与 `website/sidebars.ts` 登记。

## 阶段 C

### C1. SQL 回归（AC#17、18）

同一脚本的 `production-change-grants` 用例，期望见 [rxdb-change-permissions §5](contracts/rxdb-change-permissions.md)。
用例在 `BEGIN … ROLLBACK` 内执行生产脚本，跑完容器权限仍是开发默认。

### C2. 分支同步回归（AC#18）

```bash
docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < docker/sql/production/rxdb-change-grants.sql
pnpm nx test rxdb-adapter-supabase -- branch-contracts
```

期望：分支同步 spec 全部通过。跑完后重建容器恢复开发默认（测试清理依赖 `anon` 删日志）。

### C3. 文档评审（AC#19）

`website/docs/adapters/supabase.md`「生产部署」节含：日志表权限脚本、业务表 RLS 推荐策略、已知限制（见
[rxdb-change-permissions §6](contracts/rxdb-change-permissions.md)）。

## 收尾门禁（每个阶段的 PR）

```bash
pnpm nx run-many -t lint test build typecheck --projects=tag:js-lib
pnpm audit:callsite-drift
pnpm audit:suite-callsites
pnpm check-migration-release-gate
```

阶段 A 只动参考 SQL 与回归脚本，门禁只需 SQL 回归 + `rxdb-adapter-supabase` 的 lint / test。

> SQL 回归不在 CI 里，按 A1 / B1 / C1 手动跑并贴输出；是否接入 CI 登记为待评估项（research D20）。
