# Quickstart: US-220 验证指南

**Plan**: [plan.md](plan.md) | **Contracts**: [rxdb-mutations](contracts/rxdb-mutations.md)、[existence-probe](contracts/existence-probe.md)、
[sqlstate-registry](contracts/sqlstate-registry.md)

本文件只列验证步骤与期望结果；用例的实现写在 tasks 阶段。所有命令在仓库根目录执行。

## 0. 前置

```bash
# 启动并初始化 CI Supabase 环境（容器 supabase-db，REST 在 localhost:54331）
pnpm nx run rxdb-adapter-supabase:test-env

# 改过参考 SQL 后重新加载（init-db.sh 只在初始化时跑）
docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < docker/sql/04-rxdb-utils-functions.sql
```

## 1. SQL 回归（AC#1～5、AC#8）

```bash
bash packages/rxdb-adapter-supabase/src/__tests__/run-supabase-sql-security-regressions.sh
```

期望：16 个用例（既有 10 个 + 新增 6 个）中 15 个 `🟢 PASS`；`rls-filtered-delete` 保持红（它断言的是 US-218 阶段 A 要修的行为，本故事不改）。只跑一个用例：

```bash
docker exec -i supabase-db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -v test_case=update-gone < packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql
```

| 用例                     | AC   | 期望                                                                                          |
| ------------------------ | ---- | --------------------------------------------------------------------------------------------- |
| `update-partial-columns` | 1    | 只推 `completed`：成功，`title` 等 NOT NULL 列不变，日志新增 1 条 UPDATE                      |
| `update-owner-rls`       | 2    | `FOR ALL` 本人策略，改自己的行、载荷不带 `owner`：成功                                        |
| `update-shared-edit`     | 3    | SELECT / UPDATE 不设限、INSERT 限本人，改他人的行：成功                                       |
| `update-denied`          | 4    | UPDATE `USING` 不放行 / SELECT 不放行：均 42501，`DETAIL.reason = denied`，行未变，无新日志   |
| `update-gone`            | 5    | NOT NULL 表与全可空表：均 `RX001`，`DETAIL.reason = gone`，表里无新行，无新日志               |
| `existence-probe`        | 4、5 | 隐藏行 → 返回；缺失 → 不返回；返回原样元素；非同步表 → 22023；属主绕过 RLS 的前提在容器里成立 |
| 既有 10 个               | 8    | 不变；`rls-filtered-delete` 仍断言今天的 DELETE 行为（US-218 阶段 A 交付时改写）              |

**先红**：在实现之前跑，AC#1 期望 23502、AC#2 / AC#3 期望 42501、AC#5 的全可空表期望「静默插入新行」导致断言失败。

## 2. 单元测试（载荷形状）

```bash
pnpm nx test rxdb-adapter-supabase -- review-regressions
```

期望：同一次推送里，新建只在 `p_upserts`，修改只在 `p_updates`；修改行不含 `createdBy`；非 main 分支 `p_updates` 为空数组；
`mergeChanges()` 的 RPC 参数含 `p_updates`。

## 3. 真实链路：双客户端（AC#6）

```bash
pnpm nx test rxdb-adapter-supabase -- update-push-semantics
```

期望：客户端 A 新建并推送 → 客户端 B 拉取后只改一列并推送 → A 拉取后看到该列新值、其他列不变；修改路径上没有 23502 / 42501。
spec 记录单批推送耗时，作为 SC-006（< 100 ms）的验证数据。

## 4. e2e（AC#7）

```bash
pnpm nx run dev-rxdb-supabase-e2e:e2e-remote
```

期望：`Supabase remote sync` 下新增用例通过——新建待办 → 推送 → 勾选完成 → 推送 → 另一个浏览器上下文拉取后显示已完成；
`rxdb_mutations` 请求体里勾选那次在 `p_updates`。

## 5. 版本组合抽查（FR-011）

在**旧** SQL 上跑新客户端（重新加载上一个版本的 `04-rxdb-utils-functions.sql` 后跑 §3）：期望推送以 `SupabaseDataError` 失败，
消息含 `PGRST202` 或「Could not find the function public.rxdb_mutations(… p_updates …)」，本地变更仍待推送。验证后重新加载新版 SQL。

## 6. 收尾门禁

```bash
pnpm nx run-many -t lint test build --projects=rxdb-adapter-supabase
pnpm nx run rxdb-adapter-supabase:typecheck
```

文档自检：`packages/rxdb-adapter-supabase/README.md`、`website/docs/adapters/supabase.md` 的 `rxdb_mutations` 参数表含 `p_updates`；
`website/docs/migration/supabase-update-push.md` 已在 `website/docs/migration/README.md` 与 `website/sidebars.ts` 登记。

> SQL 回归脚本目前没有接入 nx target 或 CI（仓库里没有调用方），按 §1 手动跑；是否接入 CI 不在本故事范围，tasks 阶段登记为待评估项。
