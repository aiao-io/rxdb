# Admin 应用验收台账

当前批次为 ADMIN-US-001 / ADMIN-US-002 / ADMIN-US-003。结构门禁只检查文档契约，应用单测、构建和浏览器行为分别验收；平台故事的完成状态不作为本应用新 AC 的证据。

## 当前批次

| 故事与 AC          | 验证层级                        | 入口                                                                                                                                                                                             | 当前结论                                                              |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| ADMIN-US-001 #1    | 文档 / 源码复核                 | [README](README.md)、[CONVENTIONS](CONVENTIONS.md)、[根应用管理办法](../../../requirements/app-template/README.md)                                                                               | 目录、编号、四条故事与导航通过复核                                    |
| ADMIN-US-001 #2    | 临时目录正负夹具                | `pnpm nx run rxdb-admin-template-react:requirements-test`                                                                                                                                        | 通过，含缺失 YAML、依赖环、Done AC 绕过与标题锚点负例                 |
| ADMIN-US-001 #3    | 当前应用需求                    | `pnpm nx run rxdb-admin-template-react:requirements-check`                                                                                                                                       | 通过，平台能力引用与应用状态独立                                      |
| ADMIN-US-002 #1～3 | 配置接线与 HTML 执行测试        | [app-config.spec.ts](../src/app/app-config.spec.ts)、[entity-registry.spec.ts](../src/app/entities/entity-registry.spec.ts)、[workbench-shell.spec.ts](../src/app/shell/workbench-shell.spec.ts) | 通过，默认配置、新标识隔离、命名空间和真实 Vite HTML 转换均有行为测试 |
| ADMIN-US-002 #4    | 静态检查 / 构建 / 浏览器        | 应用 lint、typecheck、test、build；`pnpm nx run rxdb-admin-template-react-e2e:e2e --workers=2`                                                                                                   | 通过，覆盖首屏主题、旧键迁移、CRUD、搜索、刷新重开和备份恢复          |
| ADMIN-US-003 #1～6 | 单测 / 静态检查 / 构建 / 浏览器 | [国际化本地验收](plans/client-i18n-verification.md)、[国际化浏览器测试](../../rxdb-admin-template-react-e2e/src/i18n.spec.ts)                                                                    | 接入中，待实际运行验证                                                |

详细命令与证据见 [孵化基线本地验收](plans/incubation-verification.md)。当前两条实现故事处于 `In Review`，尚未以本地验证替代合并。

## 根需求审计

根需求派生视图已补齐 63 个公开包计数、US-530～533 状态索引与路线图覆盖，根需求一致性门禁须与本应用结构门禁分别复验。文档同步不改变平台故事状态，也不作为应用已关闭的证据。

## 现有能力的复验入口

| 层级       | 证据入口                                                                                                                                                                                            | 证明范围                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 本地单测   | [entity-registry.spec.ts](../src/app/entities/entity-registry.spec.ts)、[backup-ops.spec.ts](../src/app/backup/backup-ops.spec.ts)、[record-search.spec.ts](../src/app/shell/record-search.spec.ts) | 对应模块契约，不替代浏览器闭环       |
| 浏览器业务 | [workbench.spec.ts](../../rxdb-admin-template-react-e2e/src/workbench.spec.ts)、[backup-restore.spec.ts](../../rxdb-admin-template-react-e2e/src/backup-restore.spec.ts)                            | 默认资产、本机持久化与恢复           |
| 浏览器外壳 | [admin-shell.spec.ts](../../rxdb-admin-template-react-e2e/src/admin-shell.spec.ts)、[admin-shell.a11y.spec.ts](../../rxdb-admin-template-react-e2e/src/admin-shell.a11y.spec.ts)                    | 页面、主题、布局、页签等对应测试场景 |

## 尚未证明

- 非资产业务替换与自定义页面完整扩展体验，分别属于 ADMIN-US-101 / ADMIN-US-102。
- 独立复制、仓外安装、正式部署或发行；当前继续在本仓库孵化。
- 真实账号、服务端授权、云端协作或其他宿主。
