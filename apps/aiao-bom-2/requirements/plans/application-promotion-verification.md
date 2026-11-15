# 应用化工程验收记录

日期：2026-11-06（Asia/Shanghai）。范围：`dev-rxdb-bom` 到 `aiao-bom` 的目录与工程迁移、独立应用需求、模板落地及结构门禁。

## 实施边界

- Nx move generator 迁移应用与 E2E；同步包名、TypeScript 引用、任务依赖、产物路径、启动配置和可复现命令。
- 保留原数据库标识；业务计算、领域包与现有交互契约继续由既有测试回归。
- 产品体验研究迁入应用 plans；根 US-525 保留平台组合验收与旧 AC 证据语义，当前产品范围由应用故事管理。
- 新增独立需求脚本与回归，接入应用 lint/test 和 CI。

## 红测

门禁实现前通过 Nx 运行 13 组回归，全部失败。覆盖 YAML、唯一 ID/文件名、编号段、AC、候选 AC、依赖与环、平台引用、epic、四份派生视图、相对链接和标题锚点。另补 3 组边界红测，覆盖无 frontmatter 辅助材料、Epic 三态与文件名、跨故事承接 AC，修复后共 16 组通过。

## 验证结果

| 检查               | 结果                                                                                       | 复验命令                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 应用完整工程校验   | 41 个 Nx 任务通过，耗时 7 分 18 秒                                                         | `pnpm nx run-many --projects=aiao-bom,aiao-bom-e2e --targets=lint,typecheck,spec-typecheck,test,build,e2e --parallel=1 --skipRemoteCache --output-style=static` |
| 应用需求及门禁回归 | 6 条故事；16/16 回归通过；行 94.90%、分支 93.96%、函数 93.48%，全部超过 80%                | `pnpm nx run-many --projects=aiao-bom --targets=requirements-check,requirements-test --parallel=1 --skipRemoteCache --output-style=static`                      |
| 静态质量           | 两项目 lint 零警告、typecheck 通过，应用 spec-typecheck 通过                               | 完整工程校验命令                                                                                                                                                |
| 单元测试           | 25 文件、224/224 通过                                                                      | `pnpm nx run aiao-bom:test`                                                                                                                                     |
| 浏览器回归         | Chromium 39/39，通过生产静态产物，单 worker、零重试                                        | `pnpm nx run aiao-bom-e2e:e2e`                                                                                                                                  |
| 平台需求一致性     | 129 条故事，108 Done / 6 In Progress / 8 In Review / 7 Backlog / 0 Blocked；应用故事不混入 | `pnpm nx run @aiao/source:audit-requirements`                                                                                                                   |

代码比对确认原应用 78 个 src 文件和 6 个 E2E src 文件内容逐字节不变。完整运行日志位于本机 `/tmp/aiao-bom-application-gate.log`，本轮文档与门禁复验以所列 Nx 命令重现。

已有平台需求告警来自 `board-v2-github-projects-style.md` 的过程标题，与本轮修改无关。需求复验曾在任务通过后遇到 Nx 本地 SQLite 任务数据库外键错误。通过 `pnpm nx reset --onlyDaemon --onlyWorkspaceData` 重建本工作区派生数据后，根需求门禁正常退出，应用门禁与 lint 的串行复验通过。最终 `pnpm nx format:check --base=HEAD` 与 `git diff --check` 通过，旧目录不存在，待提交文件不含生成的测试产物。

## 环境边界

本地脚本与浏览器结果不能证明真实企业数据、跨部署 origin 的持久化迁移、公网部署或正式发行。相关准入与证据见应用未来需求与分层验收台账。
