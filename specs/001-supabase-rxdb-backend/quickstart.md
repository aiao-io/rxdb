# Quickstart: Supabase-first 后台与 RxDB 同步架构

## 当前状态

本特性已完成代码实现和本地真实 Supabase 验证：Admin Auth/普通 Supabase 业务路径、特权 Edge Function、后台 RxDB 同步装配、`rxdb-model-angular` 配置入口、领域级配置提交投影、原子 apply/回滚 RPC 和 PGMQ 隔离 PoC 均已接入。普通 JWT、workspace/RLS、Pull/Push、Realtime 恢复、revision 冲突、tombstone、PGMQ 入队授权和运维演练已在 2026-11-15 通过；Playwright、双区域和生产切换仍待验收，PGMQ 未通过生产评审前继续使用 Durable Object。

## 2026-11-15 已验证证据

- Admin 普通业务表和 RPC 通过 Supabase PostgREST 直连；Auth Admin API、封禁/解禁和 service role 操作只通过 `admin-api` Edge Function。
- 后台 RxDB 使用普通 JWT，不把 service role 当作同步身份；本地 PGlite 与 Supabase remote adapter、history、sync、working-tree、固定 workspace filter 和 backend identity 校验已接入。
- 真实本地 Supabase 集成已验证 Pull/Push、重复批次、Realtime 多节点、Realtime 断线后的 REST 恢复、revision 冲突和删除 tombstone。
- PGMQ 已验证真实事务入队、匿名/普通身份拒绝、service role 指标读取、失败回滚、consumer 重启/积压/清理/死信演练；生产任务链路仍由 Durable Object 承担。
- 配置 projection、fingerprint、补偿扫描和 apply/rollback RPC 已验证。完整配置实体与 projection 接入 Supabase `sync/syncBranches`、完整 working-tree 分支合并和后台提交状态 UI 仍未宣称完成。

## 本地准备

```bash
pnpm install
pnpm nx run aiao-media:requirements-check
```

使用本地 Supabase 配置启动产品环境，准备：

- 有效 Supabase Auth 管理员账号；
- `media_admin_memberships` 中的管理员授权；
- 业务表 RLS 和普通 RPC；
- Edge Function 本地 secret；
- 后台同步节点的普通 JWT 或专用 Auth 服务账号。

## 验证 Admin 权限边界

1. Admin 使用 Supabase Auth 登录。
2. 使用浏览器网络面板确认登录不调用 `/api/admin/login`。
3. 查询普通业务数据，确认走 PostgREST/RPC。
4. 查询 Auth 用户、封禁或解禁用户，确认走 `admin-api` Edge Function。
5. 使用匿名、普通用户和已撤权管理员分别验证 401/403。
6. 构建 Admin 并搜索 bundle，确认没有 secret/service role。

## 验证后台 RxDB 同步

1. 启动后台 Node RxDB 实例。
2. 连接本地 adapter 和 Supabase remote adapter。
3. 通过普通 JWT 执行 RLS 自检和 Realtime 订阅。
4. 在 Admin 修改测试实体并触发同步。
5. 在后台本地读取同一实体，再修改并推回 Supabase。
6. 断开网络、重启后台、恢复网络，验证游标和未确认变更。
7. 制造 revision 冲突，确认冲突可观察且不会静默覆盖。

## 验证配置提交

1. 在配置分支中编辑多个配置实体。
2. 执行 `workingTree.commit(message)`。
3. 检查领域 commit projection 是否包含完整 parent、fingerprint 和 ordered changes。
4. 模拟 projection 写入后进程退出。
5. 重启并运行补偿扫描。
6. 调用 `apply_media_config_commit`，确认配置、审计和 commit 状态原子更新。
7. 对已应用或已发布提交调用 `rollback_media_config_commit`，确认 revision/CAS、审计和幂等；当前回滚是 RPC 级逆向操作，不生成新的 RxDB commit projection。

## 验证 PGMQ PoC

PGMQ PoC 不修改当前 Durable Object 生产路径。

1. 创建任务、预留积分并在同一事务发送最小消息。
2. 启动 Node consumer，确认只读取 `taskId`、revision 和 kind。
3. 在 provider 成功后删除消息前终止 consumer。
4. 等 visibility timeout 到期后重试。
5. 验证结果唯一性、积分结算、任务状态和 Storage 清理。
6. 运行并发、积压、重启、滚动发布和双区域演练。
7. 输出 PGMQ 与 Durable Object 的切换结论。

## 验证命令

```bash
env -u PNPM_HOME pnpm nx run aiao-media:requirements-check
env -u PNPM_HOME pnpm nx run aiao-media-api:lint --output-style=static
env -u PNPM_HOME pnpm nx run aiao-media-api:typecheck --output-style=static
env -u PNPM_HOME pnpm nx run aiao-media-api:test --output-style=static
env -u PNPM_HOME AIAO_MEDIA_RUN_LOCAL_SUPABASE=1 pnpm nx run aiao-media:backend-rxdb-local-test --output-style=static
env -u PNPM_HOME pnpm nx run aiao-media-admin:lint --output-style=static
env -u PNPM_HOME pnpm nx run aiao-media-admin:bundle-security --output-style=static
```

所有代码改动必须先补失败测试，再实现，再运行受影响项目的 lint、typecheck、test 和 build。
