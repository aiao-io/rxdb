# Admin 产品验收台账

当前批次为 ADMIN-US-001 / ADMIN-US-002 / ADMIN-US-003 / ADMIN-US-004 / ADMIN-US-102。结构门禁只检查文档契约，应用单测、构建和浏览器行为分别验收；平台故事的完成状态不作为本应用新 AC 的证据。

## 当前批次

| 故事与 AC          | 验证层级                        | 入口                                                                                                                                                                                                                              | 当前结论                                                              |
| ------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| ADMIN-US-001 #1    | 文档 / 源码复核                 | [README](README.md)、[CONVENTIONS](CONVENTIONS.md)、[应用级需求与项目治理办法](../../requirements/application-governance.md)                                                                                                      | 初始五条故事的目录、编号与导航通过复核                                |
| ADMIN-US-001 #2    | 临时目录正负夹具                | `pnpm nx run rxdb-admin-template:requirements-test`                                                                                                                                                                               | 通过，含缺失 YAML、依赖环、Done AC 绕过与标题锚点负例                 |
| ADMIN-US-001 #3    | 当前应用需求                    | `pnpm nx run rxdb-admin-template:requirements-check`                                                                                                                                                                              | 通过，平台能力引用与应用状态独立                                      |
| ADMIN-US-002 #1～3 | 配置接线与 HTML 执行测试        | [app-config.spec.ts](../apps/react/src/app/app-config.spec.ts)、[entity-registry.spec.ts](../apps/react/src/app/entities/entity-registry.spec.ts)、[workbench-shell.spec.ts](../apps/react/src/app/shell/workbench-shell.spec.ts) | 通过，默认配置、新标识隔离、命名空间和真实 Vite HTML 转换均有行为测试 |
| ADMIN-US-002 #4    | 静态检查 / 构建 / 浏览器        | 应用 lint、typecheck、test、build；`pnpm nx run rxdb-admin-template-react-e2e:e2e --workers=2`                                                                                                                                    | 通过，覆盖首屏主题、旧键迁移、CRUD、搜索、刷新重开和备份恢复          |
| ADMIN-US-003 #1～6 | 单测 / 静态检查 / 构建 / 浏览器 | [国际化本地验收](plans/client-i18n-verification.md)、[国际化浏览器测试](../apps/react-e2e/src/i18n.spec.ts)                                                                                                                       | 三端六项 AC 本地通过，In Review；未合并                               |
| ADMIN-US-102 #1～3 | 文档 / 配置单测 / 真实浏览器    | [扩展指南](plans/custom-pages-navigation.md)、[Dashboard 场景](../apps/react-e2e/src/dashboard.spec.ts)、[偏好场景](../apps/react-e2e/src/admin-shell.spec.ts)                                                                    | 三端本地通过，In Review；未合并                                       |

详细命令与证据见 [孵化基线本地验收](plans/incubation-verification.md)。ADMIN-US-001 / ADMIN-US-002 的实现随 [PR #199](https://github.com/aiao-io/rxdb/pull/199) 合入。

## Dashboard 三端优化

2026-11-16 的 [Dashboard 验收记录](plans/nexus-dashboard-verification.md) 汇总两阶段已执行结果：Angular / React / Vue 单测分别 60 / 63 / 60 条通过，完整 E2E 每端 97 条通过，静态检查与构建通过。本轮回填国际化与页面扩展证据，新增导航场景后完整 E2E 每端 99/99；新业务替换的前置与后续工作见 [优化实施清单](plans/nexus-template-optimization-tasks.md)；故事状态已按对应 AC 证据更新为 In Review，尚不计入 Done。

## 根需求审计

根需求派生视图已补齐 63 个公开包计数、US-530～533 状态索引与路线图覆盖，根需求一致性门禁须与本应用结构门禁分别复验。文档同步不改变平台故事状态，也不作为应用已关闭的证据。

## 现有能力的复验入口

| 层级       | 证据入口                                                                                                                                                                                                                             | 证明范围                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| 本地单测   | [entity-registry.spec.ts](../apps/react/src/app/entities/entity-registry.spec.ts)、[backup-ops.spec.ts](../apps/react/src/app/backup/backup-ops.spec.ts)、[record-search.spec.ts](../apps/react/src/app/shell/record-search.spec.ts) | 对应模块契约，不替代浏览器闭环       |
| 浏览器业务 | [workbench.spec.ts](../apps/react-e2e/src/workbench.spec.ts)、[backup-restore.spec.ts](../apps/react-e2e/src/backup-restore.spec.ts)                                                                                                 | 默认资产、本机持久化与恢复           |
| 浏览器外壳 | [admin-shell.spec.ts](../apps/react-e2e/src/admin-shell.spec.ts)、[admin-shell.a11y.spec.ts](../apps/react-e2e/src/admin-shell.a11y.spec.ts)                                                                                         | 页面、主题、布局、页签等对应测试场景 |

## 尚未证明

- 非资产业务替换仍属于 ADMIN-US-101，缺真实业务输入；ADMIN-US-102 的 Dashboard 页面扩展三项 AC 已三端本地通过，剩余为统一评审、合并与 PR 证据。
- [ADMIN-US-201～ADMIN-US-216](status-overview.md) 的认证、团队、草稿同步、数据 PR、审核、冲突、合并、审计和后续增强全部尚未实现或验收。
- 独立复制、仓外安装、正式部署或发行；当前继续在本仓库孵化。
- Supabase 真实账号、服务端授权、跨设备协作和原子合并环境；现有平台能力测试不能替代应用故事验收。

## 产品根需求迁移

[ADMIN-US-004](stories/platform/ADMIN-US-004-product-requirements.md) 负责三端及 E2E 的产品目录、需求归属、共享门禁和 affected 接线，迁移后的类型检查、应用测试、生产构建、lint 与三端各 104 条完整浏览器回归已通过（React 使用单 worker 复验），In Review，详细记录见 [迁移验收](plans/product-requirements-verification.md)。此变更不增加业务运行时功能，也不改变原故事的实现状态。

## 协作契约与复验入口整改

[需求优化复核](plans/requirements-refinement-verification.md) 记录最终候选审批、同任务分叉、共享表禁写、邀请消费、可信初始化、保存/提交及离线会话规则的 AC 映射，以及性能脚本两种布局的回归。对应协作故事仍为 Backlog，需求和工具验证不能代替运行时验收。
