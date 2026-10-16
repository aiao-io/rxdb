---
kind: review-plan
scope: plugins
baseline: main@94df0a04
created: 2026-10-16
---

# packages 插件组评审计划

## 覆盖范围

本组覆盖 `packages/` 下 22 个插件包及其框架适配层：

- `rxdb-plugin-graph`、`rxdb-plugin-history`、`rxdb-plugin-querycache`、`rxdb-plugin-replay`
- `rxdb-plugin-replay-angular`、`rxdb-plugin-replay-react`、`rxdb-plugin-replay-vue`
- `rxdb-plugin-search`、`rxdb-plugin-search-angular`、`rxdb-plugin-search-react`、`rxdb-plugin-search-vue`
- `rxdb-plugin-storage`、`rxdb-plugin-sync`
- `rxdb-plugin-tree`、`rxdb-plugin-tree-angular`、`rxdb-plugin-tree-react`、`rxdb-plugin-tree-vue`
- `rxdb-plugin-working-tree`、`rxdb-plugin-working-tree-angular`、`rxdb-plugin-working-tree-react`、`rxdb-plugin-working-tree-vue`
- `rxdb-plugin-workspace`

每包报告见本目录中同名 `.md` 文件。

## 评审方法

1. 固定基线为当前 `main@94df0a04`，盘点每个包的全部 `src/` 文件、测试/fixture、入口和生成入口。
2. 逐包核对 `README.md`、`package.json`、`project.json`、`tsconfig*.json`、`vite.config.mts`；Angular 包额外核对 `ng-package.json`。
3. 静态检查公开 exports 与实际构建入口、依赖/peerDependencies、插件安装和销毁、异步错误路径、资源清理、跨框架 API 对称性，以及文档示例与源码。
4. 以源码行号记录证据；只有能定位且可复现的问题才登记 P0/P1/P2/P3，未发现问题也明确写出检查范围。
5. 尝试使用 Nx 运行门禁；本轮主机 Node `v22.14.0` 不满足仓库 `>=26` 要求，Nx 同时返回 `Operation not permitted (os error 1)`，故所有包的动态结论保留为待验证，不把静态检查冒充测试通过。

## 统一结论口径

- `🟢`：源码、配置、测试和动态证据闭环，未发现问题。
- `🟡`：静态检查未发现可确认问题，但动态门禁、真实宿主或发布消费仍缺证。
- `🔴`：有可复现的 P0/P1/P2/P3 问题，报告必须给出行号、影响、建议和验证方式。

本轮未修改生产代码、测试代码或依赖，也未提交 Git。后续在 Node 26+ 环境完成串行 Nx lint/typecheck/test/build（含需要的 browser/coverage target），再逐包更新结论和高风险项。

## 高风险/需跟进项

- `rxdb-plugin-querycache`：首轮 P2（history/sync peer 缺失）已修复并复核（205/205 通过）；二次评审新确认 1 条 P2（`QueryCacheEngine.findById` 绕过作废代次检查）；详见 `rxdb-plugin-querycache.md`。
- `rxdb-plugin-replay-vue`：首轮 P2（挂载前 seek 丢失）已修复并复核（11/11 通过，三端语义对齐）；无剩余问题。
- `rxdb-plugin-search`：二次评审确认 1 条 P3（重入 `loadMore` 顶掉 page-0 刷新）；React/Vue 适配层各 1 条 P2（桥接流无 error 处理器，三端不对称）；详见各报告。
- 其余包：二次评审未再确认 P0/P1/P2/P3；不是动态测试通过结论。

## 可复用的静态门禁证据

本轮在仓库当前 Node 环境成功执行了不依赖 Nx daemon 的两项审计：`docs-plugin-surface.mjs --check`（扫描 169 个文件通过）和 `package-runtime-conditions.mjs`（通过）。`subpath-build-entries.mjs` 因新评审 worktree 没有构建产物而返回「一个包都没扫到」，不能据此判定构建入口通过。上述审计只证明文档扫描和运行条件元数据的一致性，不能替代各包的编译、单测、浏览器或宿主验证。

## 执行顺序与重点

| 阶段                   | 包                                                                            | 重点                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A：核心状态/数据一致性 | `graph`、`history`、`querycache`、`sync`、`tree`、`working-tree`、`workspace` | 事务边界、CAS/并发、撤销/恢复、缓存回写、递归/资源上限、跨连接纪元与持久化。              |
| B：宿主与文件能力      | `storage`、`replay`                                                           | OPFS/桌面失败清理、对象 URL、rrweb 按需加载、录制库销毁与续录。                           |
| C：框架适配对称性      | replay/search/tree/working-tree 的 Angular、React、Vue 包                     | 输入变更、卸载与晚到异步、错误透传、公开类型和三端命令/状态同构。                         |
| D：发布闭环            | 全部 22 包                                                                    | Nx build/typecheck、覆盖率、browser target、`pnpm pack` 独立消费者及 exports/types 入口。 |

每阶段先完成源码与配置静态核对，再运行串行门禁；动态失败需先排除 Node/Nx 并发或宿主环境噪声，再决定是否登记为产品缺陷。任何确认问题必须单独给出最小复现、影响范围、修复建议和回归验证，避免以覆盖率或“有测试文件”替代行为证据。
