# rxdb-admin-template 代码评审报告

> 评审日期：2026-11-17
> 评审分支：`admin-template`（`0e38c8c1b`）
> 对比基线：`origin/main`（`b2e746fa1`）
> 评审范围：当前分支相对 `origin/main` 的全部差异，覆盖 `rxdb-admin-template/` 下 Angular、React、Vue 三端应用及 E2E、`packages/collaboration` 协作包、Supabase migration、脚本和需求门禁。
> 用户故事缺口分析见同目录 [USER-STORY-GAP-2026-11-17.md](USER-STORY-GAP-2026-11-17.md)。

## 1. 总体结论

**🟢 当前没有 P0，也没有遗留的 P1。** 初始只读评审发现 1 条 P1 和约 20 条 P2；本轮已经修复离线会话恢复、编辑草稿保护、Dashboard 活动流恢复、邀请重试死锁、搜索分页参数校验和协作错误词条等关键问题，并完成定向测试和全量门禁复核。

当前结论如下：

- 协作链路的核心授权、RLS、幂等回执、原子合并和三方合并设计成立，没有发现可以绕过服务端规则写入共享数据的路径。
- 三端对外功能仍保持对称；已经补齐的修复均覆盖 Angular、React、Vue 需要共享行为的入口。
- 初始 P1 已清零；部分原始 P2 已修复，剩余主要是架构收敛、测试深度、边界护栏和运维证据，不构成当前已发现的数据损坏路径。
- 全量门禁首次并行执行出现 1 个 browser flaky 任务失败；该任务串行复跑通过。因此不能把首次 `pnpm test-all --base=origin/main` 记为全绿，但当前没有复现出产品代码回归。

## 2. 本轮已完成的优化

### 2.1 协作会话、草稿和重试

- `packages/collaboration/src/client/controller.ts`、`editor.ts`、`mount.ts`：`autoRefreshToken` 改为持续开启，在线/离线状态恢复时调用 `reconnect()`，重新获取 session 并刷新当前 workspace。
- 增加锁定前 checkpoint 注册机制。锁定、退出和会话失败前，`TaskEditor.checkpoint()` 会将 dirty buffer 保存为本地草稿，避免 access token 过期后清理编辑器造成用户输入丢失。
- 修复 `accept_invite` 的 pending 重试死锁：重试时直接向邀请 workspace 重发原 operation，成功后再刷新 workspace 列表并选择 workspace；不再先读取尚未加入的 workspace 快照。
- `pending()` 遇到损坏的 `sessionStorage` JSON 会自动清理，避免坏数据永久阻塞后续 durable command。
- `api.ts` 对非 JSON 命令响应标记为 `uncertain`，保留服务端可能已经接受的 pending operation；controller 在 refresh/fork 失败时也不再误删 pending 请求。

### 2.2 Dashboard、搜索和表格行为

- Angular、React、Vue 三端 `dashboard-activity-source` 在查询失败后只发出错误状态，保留 RxDBChange 监听；后续数据库变更可以重新查询并恢复成功状态，流不会因为一次瞬时查询失败永久结束。
- 三端 shell 增加 `normalizeSearchPageSize(value: unknown)`：非法值回退到 20，数值限制在 5–50，小数四舍五入，并兼容被手工篡改的数字字符串、`NaN`、越界值和空字符串。
- 修复宽屏拖拽数据列后 actions 列被挤窄的问题；三端 fake VTable 补齐 `getHeaderField()`，相关表格和 E2E 用例已经覆盖。
- 匿名数据导入统一处理运行时 `Date`、非法日期、非有限数字和非法日期字段，日期输出统一为 `YYYY-MM-DD`。

### 2.3 协作数据和 i18n

- Presence 从业务 revision、audit 和 receipt 中独立出来，使用 `public.admin_presence` 表和 `expires_at bigint` TTL；通过 Supabase Realtime 增量同步，成员撤权时清理 Presence。
- 补齐协作错误词条“请求结果不确定，请确认或重试原请求”的英文翻译，文件路径为 `packages/collaboration/src/messages.ts`，并增加 API 测试。
- 保留原有三端 i18n 对齐机制；协作目录仍需要补充逐键门禁，避免未来新增 `tx()` 词条时静默回退中文。

## 3. 原始问题状态

### 3.1 已修复或已验证

| 原始问题 | 状态 | 结论 |
| --- | --- | --- |
| 离线冷启动后 `autoRefreshToken` 永久关闭，锁定时丢失 dirty buffer | ✅ 已修复 | 恒开 token refresh、online/offline reconnect，并在锁定前 checkpoint。 |
| Dashboard 活动查询失败后 RxDBChange 流永久结束 | ✅ 已修复 | 三端改为保留事件监听，失败后可由后续变更触发恢复。 |
| 搜索 page size 直接裸断言 | ✅ 已修复 | 三端统一归一化非法值、范围、小数和字符串。 |
| `accept_invite` pending 重试先读未加入 workspace 导致死锁 | ✅ 已修复 | 直接重发原 operation，成功后再选择 workspace。 |
| 协作 uncertain response 英文界面显示中文 | ✅ 已修复 | 补齐 `packages/collaboration/src/messages.ts` 词条并增加测试。 |
| 宽屏拖拽后 actions 列宽度异常 | ✅ 已修复 | 修正表格列宽计算并覆盖三端验证。 |
| 匿名日期导入对运行时 `Date` 和非法日期处理不一致 | ✅ 已修复 | 统一日期归一化和非法输入拒绝。 |

### 3.2 仍保留为 backlog 的 P2

1. **三端领域逻辑重复**：`dashboard-model`、`dashboard-activity-query`、`dashboard-activity-source`、`record-search`、`workbench-menu`、`backup-controller` 等仍有三份框架绑定代码。后续可以在真实复用边界稳定后下沉到产品私有 domain 包，三端保留薄壳。
2. **测试深度不对称**：React 有较多页面级单测，Angular/Vue 仍主要依赖纯逻辑测试和共享 E2E；React 的 Dashboard、Collaboration 页面也需要补充组件级接线测试。
3. **协作 i18n 逐键门禁缺失**：当前缺失词条已补齐，但还没有强制每个 `tx()` key 都存在于英文目录的编译期或单测门禁。
4. **Playwright 失败产物仍被跟踪**：`apps/react-e2e/dot/` 下的 `.last-run.json`、trace 和 error context 仍会污染仓库，应加入忽略规则并从索引移除。
5. **React 搜索 abort 竞态**：连接等待期间注册 abort 监听过晚，需让等待连接和 abort 信号同时结束，并确保资源销毁路径只执行一次。
6. **E2E 对 VTable 私有内部的依赖**：三端共享工具仍读取 `__vtable__`、scenegraph 和内部 records；`getHeaderField()` 已补齐 fake，但稳定测试出口仍需继续收敛。
7. **工作区状态无界增长**：receipts、audit 和 notifications 尚未按 TTL、归档或分页修剪；快照和整行更新的成本会随长期运行线性增加。
8. **请求体读取无超时**：HTTP 流式读取尚未设置请求级 timeout 和连接上限，仍需补充慢速客户端防护。
9. **邀请 token 使用 query 参数**：邀请 token 仍可能出现在浏览器历史、代理日志和 Referer，后续应改为 fragment 或分离 token 交付。
10. **匿名本地身份缺少模板文档护栏**：三端的 `userId: 'userId'` 属于当前匿名本地上下文设计，但应提取命名常量并在 README 的定制表中明确其边界。

### 3.3 仍保留为 backlog 的 P3 和低风险护栏

| 位置 | 问题与后续动作 |
| --- | --- |
| `packages/collaboration/src/client/pr-view.ts` | 自定义冲突值 `JSON.parse` 的同步异常没有进入统一 failure 路径；移入 perform 或先校验。 |
| `packages/collaboration/src/server/engine.ts` | invite 审计详情可能暴露受邀邮箱；对审计字段脱敏。 |
| `packages/collaboration/src/records.ts` | 关系字段用 `String(null)` 等边界值生成关系键时可能产生错误关联；补充显式归一化。名称唯一性检查也应跳过缺失 name 的行。 |
| `packages/collaboration/src/client/editor.ts` | 数字输入可能得到 `NaN`，序列化后变成 `null`；补充输入提示或业务必填校验。 |
| `packages/collaboration/src/server/http.ts` | `decodeURIComponent()` 遇到非法编码应返回 400；请求体读取也应补 timeout。 |
| `supabase/migrations/202611160001_collaboration.sql` | `admin_audit(team_id, app_id, created_at)` 等查询索引尚未补齐。 |
| `packages/collaboration/src/server/repository.integration.spec.ts` | RLS 测试覆盖 SELECT/UPDATE/DELETE，仍需显式断言 INSERT 被拒绝。 |
| `packages/collaboration/public/collaboration-sw.js` | `event.source` 可能是没有 `url` 的 `MessagePort`；需做类型保护，并限制 Service Worker scope，避免与三端 PWA 冲突。 |
| `packages/collaboration/tsconfig.server.json` | `tsBuildInfoFile` 位于 `dist` 时清理产物会丢失增量构建信息，需移到稳定缓存目录。 |
| `packages/collaboration/src/client/mount.ts` | `restoreFocus` 存在重复条件判断，属于低风险代码清理。 |
| Angular `afterNextRender` | `/collaboration` 首次渲染回调与组件销毁之间存在竞态；需在回调内确认宿主仍有效，或改用更明确的生命周期钩子。 |
| Angular Dashboard | `db.connect()` 的同步异常不能由 `Promise.resolve(connect())` 捕获，应改为直接链式处理。 |
| Angular/Vue 实体查找 | `findWorkbenchEntity(...) as EntityType` 的断言未判空；注册表与 config 脱节时应显式失败。 |
| Angular backup | `getAdapter(...) as RestoreAdapter` 和恢复前连接检查仍依赖能力断言及 TOCTOU 防护，需把检查收敛到引擎执行点。 |
| Vue HMR | 模块级 RxDB 单例在 HMR dispose 时仍需显式销毁，避免开发环境同名实例冲突。 |
| Vue ESLint | `vue/attributes-order` 仍关闭，后续可按 rxdb-model-vue 的规则恢复。 |
| 三端 bootstrap | Angular bootstrap 失败和类似初始化异常仍缺少用户可见提示。 |
| 公开 API | `packages/collaboration` 的 model、controller、api 公开导出仍需补齐 TSDoc。 |

## 4. 三端对称性

三端路由、菜单、主题清单、偏好扩展、存储前缀、协作接线和匿名导入入口保持一致；Dashboard 活动流、搜索 page size、表格列宽和匿名日期导入的本轮修复均已覆盖 Angular、React、Vue。

仍存在以下实现层差异，但目前没有发现对外行为差异：

- React 通过路由 loader 预连接并使用 `errorElement`；Angular、Vue 由组件内完成 connect 和 loading 门控。
- Vue 对 Dashboard、Search、Backup 的文件分层与 React、Angular 不同，但功能契约一致。
- Angular/Vue 的页面级单测深度仍低于 React，需要后续补齐。
- Angular/Vue E2E 复用 React E2E 的共享 spec；这是当前测试组织设计，但共享工具修改必须继续做三端回归。

## 5. 需求和安全核对

US-201 至 US-216 的实现与故事声明总体一致。本轮修复后，US-201 的离线冷启动后重新联网场景已经补齐；仍缺少生产 SMTP 投递和验证码自然过期的外部环境证据，这属于验收证据缺口，不是当前实现缺失。

US-203 的 RLS 逻辑仍符合 SELECT-only 设计，但集成测试需要补充一条显式 INSERT 拒绝断言。工作区状态修剪、快照分页、SMTP 外部证据和运维故事中的状态管理仍属于后续 backlog。

安全复核结论保持不变：5 张 public 协作表为受限 SELECT 投影，`admin_private` 不对客户端开放；服务端命令会重新执行身份和权限校验；行锁、单事务和 operationId 幂等约束成立；前端用户内容按文本渲染，未发现可利用的 HTML 注入路径。

## 6. 已核实的非问题

- 协作 UI 中大量中文出现在 `element()` 工厂调用处并不等于绕过 i18n；工厂内部统一经过 `tx()`。真正的问题是英文目录逐键门禁缺失，缺失词条本身已补齐。
- 三端的 `userId: 'userId'` 当前是匿名本地上下文隔离设计，不是已确认的数据泄漏；风险是模板消费方接入真实身份时容易漏改，因此列为文档和命名护栏 backlog。
- material 主题不在 DaisyUI 清单中，但 `packages/rxdb-admin/admin.css` 已在 `@layer base` 定义所需 CSS 变量，不属于主题缺失。
- Angular/Vue E2E 没有独立复制 spec 是共享套件设计，不属于测试未执行；测试深度不对称指页面级单测覆盖不足。
- VTable 私有字段直读是可维护性技术债，不是本轮表格行为错误；本轮只补了稳定的 `getHeaderField()` fake 能力并验证宽度行为。

## 7. 验证结果

已通过的定向检查：

| 检查 | 结果 |
| --- | --- |
| `admin-collaboration:test` | 82/82 通过 |
| `admin-collaboration:test-integration` | 8/8 通过 |
| `admin-collaboration:lint`、`typecheck`、`build-server` | 通过 |
| `rxdb-model:test` | 1229/1229 通过 |
| `rxdb-model:lint`、`typecheck` | 通过 |
| `rxdb-plugin-board:coverage` | 167/167；Statements 96.34%，Branches 90.68% |
| Angular 应用测试 | 75/75 通过 |
| React 应用测试 | 78/78 通过 |
| Vue 应用测试 | 75/75 通过 |
| 三端应用 lint、typecheck | 全部通过 |
| 匿名日期导入 E2E | Angular、React、Vue 均通过 |
| actions 列宽 E2E | Angular、React、Vue 均通过 |

全量门禁：

```text
pnpm test-all --base=origin/main
```

首次并行执行识别到 107 个受影响项目，唯一失败任务为 `rxdb-plugin-tree:test-browser`；Nx 同时将 `rxdb-adapter-encrypted:test` 和 `rxdb-plugin-board:coverage` 标记为 flaky。随后串行复跑：

```text
pnpm nx run rxdb-plugin-tree:test-browser --output-style=static --parallel=1
```

结果为 295/295 通过，Browser coverage 为 Statements 95.34%、Branches 93.13%。该任务仍被 Nx 记录为 flaky，当前判断是并发或资源抖动；不能把首次并行 full gate 记为全绿，也没有证据支持为此修改业务代码。

报告编辑后的 `git diff --check` 和 `git diff --cached --check` 均应保持通过；本次没有自动创建新的 commit。

---

*本报告已合并初始评审、修复结论、验证结果和剩余 backlog。原 agent 完整报告如仍存在，位于 `tmp/review-{react,angular,vue}-agent.md`，争议核实记录位于 `tmp/review-adjudication.md`。*
