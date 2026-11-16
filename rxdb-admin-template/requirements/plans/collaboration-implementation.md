# 协作实现与验收记录

日期：2026-11-16。范围：ADMIN-US-201～216、共享契约 C01～C06。16 条协作故事均为 `In Review`：产品实现和本地验证已形成，但真实邮件环境验收及合入证据尚未关闭，因此不标记 `Done`。

故事表中的 ✅ 表示已有本地测试证据，⚠️ 表示该条仍有未验组合或外部环境依赖。每个故事的“验收证据”列明具体缺口；不能把本记录的通过数量推导为全部 AC 已验收。

## 实现边界

下表源码路径以 `rxdb-admin-template/packages/collaboration/` 为根。

| 能力                 | 实现位置                                                                                     | 行为                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 真实身份与每请求授权 | `src/client/controller.ts`、`src/server/http.ts`、`src/server/access.ts`                     | Supabase OTP 建立会话，服务端逐请求验证用户；浏览器不持有 service role key                                             |
| 团队、邀请和权限     | `src/server/membership.ts`、`src/client/admin-view.ts`                                       | 邀请版本、邮箱匹配、权限代次、六项权限和撤权失效；管理员复制邀请链接交付目标用户                                       |
| 任务工作树与提交图   | `src/client/local.ts`、`src/server/tasks.ts`                                                 | IndexedDB 按用户/团队/应用/任务隔离；保存、提交、outbox 和回执分开；提交 ID、父链、作者不可重写                        |
| 离线与分叉恢复       | `src/client/controller.ts`、`src/client/offline-shell.ts`、三端 `public/collaboration-sw.js` | 热续作、冷启动判定、退出锁定、未知结果查询；分叉另存后可拉取原任务，后续新编辑仍受保护                                 |
| 实时刷新             | `src/client/workspace-feed.ts`、`src/server/repository.ts`                                   | 订阅工作区版本通知后重新通过 API 授权读取；重连刷新、退出/切团队取消订阅、迟到回调隔离；同一上下文云端变更顺序执行     |
| PR、差异与候选       | `src/client/pr-view.ts`、`src/records.ts`、`src/server/governance.ts`                        | 四页签、显式 shared 目标、三方字段合并、冲突选择、最终完整性检查及版本失效                                             |
| 审核与阻塞           | `src/server/governance.ts`、`src/server/discussion.ts`                                       | 批准绑定当前候选；无候选时仍可按来源提交提出要求修改；多阶段/人数/指定审核人；已解决的必须处理线程在锚定结果变化后重开 |
| 讨论、通知与在线成员 | `src/client/pr-view.ts`、`src/client/mount.ts`、`src/server/discussion.ts`                   | 字段定位、回复、处理历史、提及、筛选和未读；15 秒心跳、45 秒过期；实时重绘保留表单和历史展开状态                       |
| 原子合并与 RLS       | `src/server/repository.ts`、产品 `supabase/migrations/202611160001_collaboration.sql`        | 同一工作区行锁内更新共享数据/头、逐记录变更、PR、提交、回执和审计；普通客户端只可按 RLS 读取投影                       |
| 三端与语言           | 三端 `/collaboration` 路由、`src/messages.ts`                                                | 懒加载同一共享 DOM UI；切换语言保留未保存输入；原匿名工作台、数据库名称和连接前恢复入口保留                            |

团队模式使用产品快照协议、IndexedDB 和共享编辑器，尚未直接接入 `rxdb-plugin-working-tree`。平台插件继续作为能力参考，边界见 [D-08](../decisions.md)。这条产品实现不代表平台插件已经完成团队协作接线。

首版使用完整快照：每请求最多 2 MiB、每任务最多 10000 条记录、每次上传最多 100 个提交；超限明确拒绝。尚未针对大型团队或长期历史进行容量与负载验收。

## 验证结果

结构化结果见 [验证摘要](evidence/collaboration-2026-11-16.json)。

| 层级                 | 命令或入口                                                                                                               | 结果                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 产品单元             | `NX_NO_CLOUD=true pnpm nx test admin-collaboration`                                                                      | 72 项通过，10 个测试文件；覆盖权限/候选/审批、HTTP、会话并发、回执、分叉、IndexedDB、表单及实时订阅                                |
| 产品类型与 lint      | `NX_NO_CLOUD=true pnpm nx run-many -t typecheck,lint -p admin-collaboration --parallel=1`                                | 通过，ESLint 零 warning                                                                                                            |
| PostgreSQL 集成      | `NX_NO_CLOUD=true pnpm nx run admin-collaboration:test-integration`                                                      | 7 项通过；初始化幂等/中途失败回滚、邀请消费与撤销/重发并发、RLS/直接写拒绝、并发上传头、合并与五类状态变更交错、事务失败回滚及重试 |
| 三端协作浏览器       | `NX_NO_CLOUD=true pnpm nx run admin-collaboration:e2e`                                                                   | 27 项分批通过，三端各 9 场景；完整运行先通过 24 项，补齐新任务/状态等待后单独复跑三端主流程 3 项通过，非同一轮全绿                 |
| 原应用单元与静态检查 | 三端 `test` / `lint` / `typecheck`                                                                                       | React 72 项、Angular 69 项、Vue 69 项通过                                                                                          |
| 原匿名浏览器回归     | 三端 `e2e --workers=1 --grep='工作台\|备份\|恢复'`                                                                       | React 43 项、Angular 43 项通过；Vue 首轮 42 项通过，1 项表格等待竞态修复后在三端分别复验通过（共覆盖三端 129 项，不是同一轮全绿）  |
| 覆盖率               | `NX_NO_CLOUD=true pnpm nx test admin-collaboration --coverage --coverage.reporter=text --coverage.reporter=json-summary` | statements 90.97%、functions 90.53%、lines 93.67%、branches 83.59%                                                                 |

覆盖率四项均超过产品包采用的 80% 检查线，但统计范围仅为单元实际加载的源码。完整页面、生产启动入口及 PostgreSQL repository 的集成/浏览器执行不计入上述数字，不能作为整个产品的全源码覆盖率。

三端协作浏览器的九组场景：

1. 真实 OTP、跨实体编辑、保存刷新、离线同步、PR 说明和目标、无候选要求修改、批准/合并权限分离、四页签、阻塞讨论、通知定位、合并、历史恢复草稿再经审批合并、级联删除预览和检查服务失败恢复；编辑器执行 axe 检查。
2. Service Worker 离线冷启动、缓存授权过期锁定、重新联网和退出。
3. 错账号不能消费邀请、正确账号接受、验证码不可重复使用。
4. 匿名资产预览确认后导入任务，原数据库和共享头保持不变。
5. 中英文切换保留未保存内容，业务值和用户 PR 标题不被翻译。
6. 双设备分叉另存，再拉取原任务远端，保留两份版本，并为分叉创建独立 PR。
7. 两阶段审批、人数不足拒绝合并、审核者无合并入口、在线成员，以及另一用户批准后真实 Realtime 通知触发刷新。
8. 双团队切换保留各自任务，隔离草稿、API 读取、通知与在线成员。
9. 六项权限独立授予和撤回、无权限入口/直接请求拒绝、指定审核人、并行两人门槛和成员撤权锁定。

## 测试环境与部署差异

浏览器 fixture 由隔离 Supabase Auth 的管理测试接口生成 OTP，再通过真实 `verifyOtp` 登录。此流程验证身份协议、验证码重复使用拒绝和用户隔离，未验证 SMTP 投递、邮件模板或真实邮箱收件。

业务事务在每次运行独立创建的临时 PostgreSQL 中执行。为覆盖真实 Realtime，fixture 只把工作区版本与可读成员投影同步到隔离 Supabase CI 数据库，不复制业务记录；这段桥接仅存在于测试脚本。正式部署必须让协作 API 的 `ADMIN_DATABASE_URL` 指向同一 Supabase 项目数据库，并执行包含 `admin_workspace_versions` publication 的迁移；生产代码在同一事务中写入版本通知。

Playwright 通过 SIGTERM 关闭 fixture，清理当次用户、投影和临时数据库；共享隔离 Supabase 栈通过 `rxdb-adapter-supabase:test-env-down` 收尾。历史遗留的本任务临时容器已清理。

## 未关闭项

- 136 条协作 AC 中，134 条已有本地证据；`ADMIN-US-201 #2/#3` 保留 ⚠️：生产 SMTP 投递和验证码自然到期的真实邮箱场景尚未验收。错误验证码、重复使用和缓存会话过期已有测试。
- `ADMIN-US-101` 保持 `Backlog`：缺少真实的新业务实体、字段、关系和命名空间输入，资产样例不能代替业务定义。
- 生产 SMTP、正式 Supabase 项目、服务部署、正式迁移执行和 PR 合入证据尚未提供；部署、迁移、真实邮箱证据与长期运行护栏由 [ADMIN-US-217](../stories/collaboration/ADMIN-US-217-production-deployment-operations.md)（Backlog）承接。
- `ADMIN-US-201～216` 均保持 `In Review`。✅ AC、本地通过和已合入/已部署是不同状态。

## 复验与运行入口

运行配置、迁移、可信初始化和 API 启动见 [产品协作包说明](../../packages/collaboration/README.md)。产品需求门禁：

```bash
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template:requirements-check
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template:requirements-test
```
