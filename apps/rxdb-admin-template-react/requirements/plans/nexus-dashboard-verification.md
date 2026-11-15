# Nexus 参考 Dashboard 三端验收记录

记录日期：2026-11-16。核对代码基线：`c2252b51`。实施进度与剩余任务见 [优化清单](nexus-template-optimization-tasks.md)。

本记录整理本轮前两阶段已执行的本地结果，并核对现有源码与日志；本次文档盘点未重新运行应用单测或 E2E。它证明当前工作区 Web 模板的 Dashboard 行为，不自动关闭 ADMIN-US-003 / 101 / 102。

## 已验证行为与入口

| 行为 | 实现或测试入口 | 证据层级 |
| ---- | -------------- | -------- |
| 三类真实资产统计、总数、空库和快捷跳转 | [数据契约](../../src/app/pages/dashboard-model.ts)、[Dashboard 浏览器场景](../../../rxdb-admin-template-react-e2e/src/dashboard.spec.ts) | 单测 / 浏览器 |
| 最近五个操作单元、时间与 changeId 排序、事务聚合、撤销及重做失效状态 | [数据契约测试](../../src/app/pages/dashboard-model.spec.ts) | 单测 |
| 当前分支与资产实体过滤、分支变更重查、加载和错误、取消订阅 | [持久化活动查询测试](../../src/app/pages/dashboard-activity-source.spec.ts) | 单测 |
| 创建、更新、删除活动及刷新保留 | [Dashboard 浏览器场景](../../../rxdb-admin-template-react-e2e/src/dashboard.spec.ts) | 浏览器 |
| 英文操作与实体显示名、日期格式、375px 无横向溢出 | [Dashboard 浏览器场景](../../../rxdb-admin-template-react-e2e/src/dashboard.spec.ts) | 浏览器 |
| 空库及有活动数据时 axe 零违规 | [工作台无障碍测试](../../../rxdb-admin-template-react-e2e/src/workbench.a11y.spec.ts) | 浏览器 |
| 资产 CRUD、搜索、外壳偏好、国际化和备份恢复原路径 | [共享 E2E 套件](../../../rxdb-admin-template-react-e2e/src/) | 完整浏览器回归 |

三端共用浏览器场景，每端构建并启动自己的生产产物。数据模型、查询模块、相关单测与中英文应用目录已比对一致；框架页面使用各自绑定。

## 执行结果

| 框架 | 应用单测 | 完整 E2E | lint / typecheck / build |
| ---- | -------- | -------- | ------------------------ |
| Angular | 60/60 | 97/97 | 通过 |
| React | 63/63 | 97/97 | 通过 |
| Vue | 60/60 | 97/97 | 通过 |

共享 React E2E 工程的 lint 与 typecheck 通过；`git diff --check` 通过。`dashboard-model.ts` 与 `dashboard-activity-source.ts` 的定向覆盖率在三端均为 statements / branches / functions 100%；这不代表整个应用覆盖率为 100%。

核对的本机日志：`/tmp/dashboard-{angular,react,vue}-e2e.log`、`/tmp/dashboard-checks2.log`、`/tmp/dashboard-final-lint.log`、`/tmp/dashboard-e2e-typecheck.log`、`/tmp/dashboard-coverage.log`。这些文件是本地临时证据，未入库；长期复验使用下列命令与已入库测试。

## 复验命令

在仓库根执行，三端 E2E 依次运行，避免本机资源争抢。

```bash
NX_NO_CLOUD=true pnpm nx run-many -p rxdb-admin-template-angular rxdb-admin-template-react rxdb-admin-template-vue rxdb-admin-template-react-e2e -t lint --max-warnings=0 --parallel=1 --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run-many -p rxdb-admin-template-angular rxdb-admin-template-react rxdb-admin-template-vue -t typecheck test build --parallel=1 --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template-react-e2e:typecheck --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template-angular-e2e:e2e --workers=2 --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template-react-e2e:e2e --workers=2 --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template-vue-e2e:e2e --workers=2 --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run-many -p rxdb-admin-template-angular rxdb-admin-template-react rxdb-admin-template-vue -t test --coverage --coverage.include=src/app/pages/dashboard-model.ts --coverage.include=src/app/pages/dashboard-activity-source.ts --parallel=1 --skipRemoteCache
```

## 实现决策与边界

- 活动源从会话历史改为持久化 `RxDBChange`。会话历史会在刷新后丢失可见记录，不能用于此处的最近活动。
- 查询限定当前分支、`assets` 命名空间及三类资产实体，不展示系统内部日志。
- 实体显示名通过 `rxdb-model` 命名空间翻译，日期复用现有 I18n `formatDate`。
- 首页继续作为连接前入口，打开 Dashboard 才连接数据库；完整回归保留全新工作台恢复备份路径。
- 当前仍先读取所有匹配日志再聚合，没有大日志量性能验收；详见清单 T04。
- 应用构建保留了 CommonJS、大 chunk 和 `lottie-web` 直接 `eval` 告警，依赖构建中亦有 PGlite `eval` 告警；通过构建不表示这些问题已治理，详见清单 T05。
- 新业务实体替换与 Dashboard 专属外壳扩展的完整验收仍需分别对照 ADMIN-US-101 / 102，现有资产数据通过不能替代跨业务证明。
