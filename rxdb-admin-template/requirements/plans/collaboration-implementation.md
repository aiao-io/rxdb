# 协作实现与验收记录

日期：2026-11-16。范围：ADMIN-US-201～216、共享契约 C01～C06。当前故事状态统一为 `In Review`：实现已进入产品私有包并完成本地验证，但尚未合入 main、完成生产部署和逐条 PR 评审，因此不标记 `Done`。

## 已落地的实现边界

| 能力 | 实现位置 | 结果 |
| --- | --- | --- |
| 真实身份与每请求授权 | `packages/collaboration/src/client/controller.ts`、`src/server/http.ts`、`src/server/access.ts` | Supabase OTP 建立会话；服务端每次用验证后的用户执行授权；客户端不持有 service role key |
| 团队、邀请、权限和策略 | `src/server/membership.ts`、`src/server/governance.ts`、`src/client/admin-view.ts` | 邀请版本、邮箱匹配、成员代次、六类权限、撤权失效和多阶段策略均进入同一工作区裁决 |
| 任务工作树与提交图 | `src/client/local.ts`、`src/server/tasks.ts` | IndexedDB 按用户/团队/应用/任务隔离；保存、提交、outbox、回执边界分开；提交保留作者、父链和 ID |
| 离线、回执和分叉恢复 | `src/client/controller.ts`、`src/client/offline-shell.ts`、`public/collaboration-sw.js` | 热续作、冷启动授权、退出锁定、未知结果查询、双设备陈旧头拒绝和另存为新任务已实现 |
| PR、差异、候选与冲突 | `src/client/pr-view.ts`、`src/records.ts`、`src/server/governance.ts` | 四页签、三方字段合并、最终候选、完整性检查、候选失效和历史只读展示 |
| 讨论、通知和 Presence | `src/server/discussion.ts`、`src/client/pr-view.ts`、`src/client/mount.ts` | 字段定位评论、回复、处理/重开、提及通知、筛选、未读和 15 秒心跳/45 秒过期 |
| 事务合并与数据库隔离 | `src/server/repository.ts`、`supabase/migrations/202611160001_collaboration.sql` | 工作区行锁、共享投影、逐记录变更、审计和合并在同一 PostgreSQL 事务中；普通客户端只有 RLS 读取权限 |
| 三端接入与语言切换 | `apps/{react,angular,vue}`、`packages/collaboration/src/messages.ts` | 三端懒加载同一共享 DOM UI；语言切换不重挂控制器、不丢编辑器输入；匿名资产工作台和数据库标识保持不变 |

现阶段团队编辑使用产品快照协议和共享编辑器；没有把现有 `rxdb-plugin-working-tree` 直接接入协作任务。该插件继续作为平台能力参考，不能被文档描述成已经完成产品闭环。

## 已执行验证

| 层级 | 命令或入口 | 结果 |
| --- | --- | --- |
| 单元测试 | `NX_NO_CLOUD=true pnpm nx test admin-collaboration` | 55 tests passed；覆盖服务端规则、输入校验、会话并发、分叉恢复、表单保留、匿名导入和 IndexedDB |
| 类型与 lint | `NX_NO_CLOUD=true pnpm nx run-many -t typecheck,lint -p admin-collaboration --parallel=1` | 通过，零 ESLint warning |
| PostgreSQL 集成 | `NX_NO_CLOUD=true pnpm nx run admin-collaboration:test-integration` | 4 tests passed；初始化幂等、RLS/直接写拒绝、并发头、事务失败回滚 |
| 三端浏览器 | `NX_NO_CLOUD=true pnpm nx run admin-collaboration:e2e --parallel=1` | React / Angular / Vue 各 6 场景，共 18 passed；包含真实 Supabase OTP、离线冷启动、邀请负例、匿名导入、语言切换、分叉恢复；主流程含 axe 检查 |
| 覆盖率 | `NX_NO_CLOUD=true pnpm nx test admin-collaboration --coverage --coverage.reporter=json-summary` | statements 90.13%、functions 90.61%、lines 92.76%、branches 83.07%；按产品包 80% 门槛通过。客户端 UI 的浏览器覆盖不计入此数字 |

浏览器 fixture 使用 Supabase Auth 管理测试接口生成 OTP，再由真实 `verifyOtp` 完成登录；这验证身份协议和隔离，不代表生产 SMTP 投递、邮件模板、域名和部署配置已经验收。

## 需求映射与未关闭项

- C01～C06 已有服务端单元、HTTP、PostgreSQL 集成和三端主流程证据，故事保持 `In Review`，待逐条 AC 评审和合并。
- `ADMIN-US-206 #7` 的实现使用显式刷新和回执，不承诺 Supabase Realtime；若要求真正 Realtime，需要另补订阅协议和三端断线测试。
- `ADMIN-US-208` 的四页签、字段定位、回复和处理已实现；还需要补三端完整评论历史与权限负例的浏览器证据。
- `ADMIN-US-214～216` 已有服务端规则和共享页面，但通知筛选、实时 Presence、多阶段审批尚未各自形成独立的三端浏览器场景。
- `ADMIN-US-101` 仍为 `Backlog`：没有真实的新业务实体、字段、关系和命名空间输入，不能用资产示例冒充完成。
- 生产 SMTP、正式 Supabase 项目、服务部署、迁移执行和 PR 合并证据尚未提供；因此所有协作故事不能标记 `Done`。

## 复验入口

```bash
NX_NO_CLOUD=true pnpm nx run admin-collaboration:test
NX_NO_CLOUD=true pnpm nx run admin-collaboration:test-integration
NX_NO_CLOUD=true pnpm nx run admin-collaboration:e2e
NX_NO_CLOUD=true pnpm nx run-many -t typecheck,lint -p admin-collaboration --parallel=1
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template:requirements-check
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template:requirements-test
```
