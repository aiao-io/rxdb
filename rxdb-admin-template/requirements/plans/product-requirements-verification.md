# 产品目录与需求迁移验收

日期：2026-11-16。对应 [ADMIN-US-004](../stories/platform/ADMIN-US-004-product-requirements.md)。故事保持 In Review，待统一评审与合并。

按仓库 [应用级需求与项目治理办法](../../../requirements/application-governance.md) 的多应用产品结构组织：三端应用及三个 E2E 的源码均位于 `rxdb-admin-template/apps/`，完整产品需求位于产品 `requirements/`，门禁脚本位于产品 `scripts/`。只使用仓库现有 Nx workspace，成员保留原 Nx 项目名。

## 产品成员

| 目录                | Nx 项目                           |
| ------------------- | --------------------------------- |
| `apps/angular/`     | `rxdb-admin-template-angular`     |
| `apps/react/`       | `rxdb-admin-template-react`       |
| `apps/vue/`         | `rxdb-admin-template-vue`         |
| `apps/angular-e2e/` | `rxdb-admin-template-angular-e2e` |
| `apps/react-e2e/`   | `rxdb-admin-template-react-e2e`   |
| `apps/vue-e2e/`     | `rxdb-admin-template-vue-e2e`     |

Nx root/sourceRoot、TypeScript 引用、Angular rootDir、Vite/Vitest 配置、HTML 准备脚本、WASM 资源、Playwright 共享场景和 pnpm workspace 链接均使用新目录。Angular 生产输出仍为仓库 `dist/apps/rxdb-admin-template-angular/`；三端端口、数据库名和存储前缀沿用原配置。当前没有产品私有包；有真实复用需要时在产品 `packages/` 中创建，不提前抽包。

## 验收记录

| AC  | 验证层级             | 入口                                                    | 当前结论                                                                                                                |
| --- | -------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Git 差异和目录复核   | 产品需求树、六个成员目录、故事 YAML 清单                | 六个成员全部位于产品 `apps/`；原 48 份需求文件完整迁入；原 21 个故事编号和状态与 Git 基线逐一一致                       |
| 2   | 链接与锚点校验       | 产品与根需求检查；当前文档链接审计                      | 迁移后的源码、E2E、故事、计划和根入口链接通过；70 份当前 Markdown 的 778 个本地链接及锚点通过（模板占位链接不参与审计） |
| 3   | Nx 实际执行与任务图  | 产品任务及三端兼容目标                                  | 三端 test 通过；同一任务图内共享需求检查和回归各执行一次                                                                |
| 4   | Nx 依赖与任务图      | 单个产品需求文件的 affected 查询；三端 test 图          | 三个应用及对应 E2E 全部受影响；保留六个原 Nx 项目名和产品依赖                                                           |
| 5   | 正负回归夹具         | `rxdb-admin-template:requirements-test`                 | 56/56 通过；覆盖需求副本、成员留在产品根外、Nx 项目被改名和正常跨应用源码链接                                           |
| 6   | 生产构建与浏览器行为 | 六个成员的类型与 lint 门禁、三端应用测试/构建、三端 E2E | 类型、lint、应用测试和生产构建通过；Angular、React、Vue 完整 E2E 各 104/104，React 使用单 worker 复验                   |

## 代码与门禁验证

| 检查                     | 本地结果                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------- |
| 产品需求结构校验         | 通过，2/22 已交付；新增迁移故事保持 In Review                                      |
| 产品门禁回归             | 56/56 通过                                                                         |
| 根安装检查回归           | 10/10 通过，包含嵌套产品应用的 shim 清理和未构建包时加载 Vite 配置                 |
| 三端应用测试             | React 72/72；Angular 69/69；Vue 69/69                                              |
| 类型检查                 | 三端应用与三个 E2E 均通过                                                          |
| 生产构建                 | Angular、React、Vue 均通过                                                         |
| 按需后端审计             | 三端分析构建与审计通过，Dashboard 和 SQLite 入口均未进入首屏静态图                 |
| Lint                     | 产品、六个成员、根脚本共八个目标通过，ESLint 零警告                                |
| 浏览器回归               | Angular 104/104、Vue 104/104（2 workers）；React 完整复验 104/104（1 worker）      |
| pnpm 锁文件与工作区链接  | 六个 importer 迁至新目录，42 个 workspace 链接均指向原公共包；全部依赖版本保持不变 |
| 源码内容                 | 原 140 份源码及测试文件内容逐一对照迁移前快照一致                                  |
| 根需求一致性             | 通过；既有 board-v2 研究文档过程叙事提示不阻断                                     |
| 需求、目录与 Nx 接线快照 | [证据摘要](evidence/product-requirements-2026-11-16.json)                          |

首次使用两个 workers 执行时，Angular 和 Vue 各 104 条通过，React 102 条通过、2 条失败：2048px 下操作列宽度断言和恢复后编辑文本断言。两条用例单独串行复跑 2/2 通过，随后完整 React 串行复验 104/104 通过；本轮未修改业务源码或共享 E2E 场景。相关日志为 `/tmp/admin-product-root-e2e.log`、`/tmp/admin-product-root-react-e2e-retry.log`、`/tmp/admin-product-root-react-e2e-final.log`。

## 复验命令

在仓库根目录执行：

```bash
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template:test --output-style=static --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run-many -t lint -p @aiao/source rxdb-admin-template rxdb-admin-template-angular rxdb-admin-template-react rxdb-admin-template-vue rxdb-admin-template-angular-e2e rxdb-admin-template-react-e2e rxdb-admin-template-vue-e2e --parallel=1 --output-style=static --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run-many -t typecheck test build -p rxdb-admin-template rxdb-admin-template-angular rxdb-admin-template-react rxdb-admin-template-vue rxdb-admin-template-angular-e2e rxdb-admin-template-react-e2e rxdb-admin-template-vue-e2e --parallel=1 --output-style=static --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run-many -t e2e -p rxdb-admin-template-react-e2e rxdb-admin-template-angular-e2e rxdb-admin-template-vue-e2e --workers=2 --parallel=1 --output-style=static --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template-react-e2e:e2e --workers=1 --output-style=static --skipRemoteCache
NX_NO_CLOUD=true pnpm nx exec --projects=@aiao/source --excludeTaskDependencies --skipRemoteCache -- node --test scripts/check-workspace.spec.mjs
NX_NO_CLOUD=true pnpm nx show projects --affected --files=rxdb-admin-template/requirements/README.md --json
NX_NO_CLOUD=true pnpm nx run-many -t test -p rxdb-admin-template-angular rxdb-admin-template-react rxdb-admin-template-vue --graph=/tmp/rxdb-admin-product-test-graph.json --skipRemoteCache
NX_NO_CLOUD=true pnpm nx exec --projects=@aiao/source --excludeTaskDependencies --skipRemoteCache -- node scripts/audit/requirements-consistency.mjs --check
```

本次证据覆盖产品目录、需求治理、Nx 接线和迁移后的现有浏览器行为。认证、同步、数据 PR 和服务端合并仍按其 Backlog 故事推进；原有 21 个故事的交付状态保持原样。
