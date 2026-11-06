# 应用模板孵化基线本地验收

验证日期：2026-11-06。范围为 ADMIN-US-001 / ADMIN-US-002，验证环境为当前仓库与本机 Chromium。

## 命令与结果

| 命令                                                          | 结果与证据边界                                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm nx run rxdb-admin-template-react:requirements-test`     | 通过；[真实目录夹具](../../scripts/check-requirements.spec.mjs) 覆盖合法文档与错误输入 |
| `pnpm nx run rxdb-admin-template-react:requirements-check`    | 通过；应用故事、派生视图、依赖和本地链接一致                                           |
| `pnpm nx run rxdb-admin-template-react:lint --max-warnings=0` | 通过，零警告                                                                           |
| `pnpm nx run rxdb-admin-template-react:typecheck`             | 通过，包含 JSON 配置与 Vite HTML helper                                                |
| `pnpm nx run rxdb-admin-template-react:test`                  | 通过；配置、外壳、实体注册、搜索与备份模块的本地契约                                   |
| `pnpm nx run rxdb-admin-template-react:build`                 | 通过；实际 HTML 无配置占位符，标题与首屏存储键来自统一配置                             |
| `pnpm nx run rxdb-admin-template-react-e2e:e2e --workers=2`   | 通过；默认资产、全文搜索、持久化、备份恢复、主题 / 布局 / 页签 / 旧键迁移及无障碍回归  |
| `pnpm nx serve rxdb-admin-template-react`                     | 先执行声明的后台公共包构建前置，再启动服务；请求 HTML 返回 200，标题和主题键正确       |

## 关键行为证据

- [应用配置测试](../../src/app/app-config.spec.ts)：另一组标题 / 品牌 / 数据库名 / 存储前缀在实际接线中生效；HTML 转义后执行首屏脚本读取正确偏好键。
- [实体注册表测试](../../src/app/entities/entity-registry.spec.ts)：另一命名空间的导航与实体查找遵守同一可见性配置。
- [外壳首屏测试](../../src/app/shell/workbench-shell.spec.ts)：Vite 实际转换默认 HTML 后验证主题、字号、颜色与圆角。
- [浏览器首屏与旧键迁移](../../../rxdb-admin-template-react-e2e/src/admin-shell.spec.ts)：阻断入口模块时，保存主题仍由首屏脚本恢复；旧偏好键迁移继续生效。

## 变更模块覆盖率

应用单测通过 28 条、需求门禁夹具通过 41 条、浏览器回归通过 80 条。本次五个变更模块的聚合覆盖率为 Lines 91.30%、Statements 89.79%、Functions 90.90%、Branches 92.85%，四项均通过 80% 门槛。这组数据不代表应用全部页面的覆盖率。

在依赖产物可用时复验：

```bash
pnpm nx run rxdb-admin-template-react:test \
  --excludeTaskDependencies \
  --skipNxCache \
  --output-style=static \
  --args='--coverage --coverage.include=app-html-plugin.ts --coverage.include=src/app/app-config.ts --coverage.include=src/app/entities/entity-registry.ts --coverage.include=src/app/rxdb/setup_rxdb.ts --coverage.include=src/app/shell/workbench-shell.ts --coverage.reporter=text --coverage.reporter=json-summary --coverage.reporter=json --coverage.reportsDirectory=../../coverage/apps/rxdb-admin-template-react-changes --coverage.thresholds.lines=80 --coverage.thresholds.branches=80 --coverage.thresholds.functions=80 --coverage.thresholds.statements=80'
```

报告输出到 `coverage/apps/rxdb-admin-template-react-changes/coverage-summary.json` 与 `coverage-final.json`，由命令重新生成，不作为仓库内必须存在的链接目标。

## 限制

本记录证明本仓库孵化基线。新业务实体替换、自定义业务页面、独立仓库运行、正式部署与认证授权均未由这些测试证明。

根需求审计命令通过 Nx 执行原脚本：

```bash
pnpm nx run @aiao/source:test-scripts --command='node scripts/audit/requirements-consistency.mjs --check'
```

该检查失败于公开包计数和 US-530～533 的索引 / 排期缺失，共九项。这些根派生视图不在本批次应用故事范围内。
