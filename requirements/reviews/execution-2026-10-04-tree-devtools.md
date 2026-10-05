---
kind: review-execution
created: 2026-10-04
updated: 2026-10-04
baseline_start: d5d0a92d22833e8ca35cdd300afbd95da82cd513
execution: in-progress
---

# 2026-10-04 第三批：树查询与 DevTools 实际深审

新增 **4 个 P2 确认问题**，更新 **6 个包/应用**的独立记录。没有改业务实现，不把生成器/模型接缝/其它后端通过当作真实 SQL/Chrome 全链路已通过。

导航：[总计划](deep-review-plan.md) · [当日上一批](execution-2026-10-04.md) · [本批证据](evidence/2026-10-04/tree-devtools/)。仍为 70 对象已启动、0 个全对象深审完成；本批新增失败专题保持部分执行，未批量核销 385 项。

## 1. 已确认意见

| 编号                                            | 实际问题                                                         | 本轮复验                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| RV-045（已修复，见 README 2026-10-05 清理记录） | PGlite 树普通字段 where 未限定 alias，四方法报 42702             | 实际 PGlite/Chromium：4 failed /2 passed                        |
| RV-046（已修复，见 README 2026-10-05 清理记录） | where 截断祖先后，增量错误加入叶子，与 SQL 重查漂移              | 官方 SQLite-WASM/RxDB observable：1 failed /1 passed            |
| RV-047（已修复）                                | changes 环引用在 mask 阶段溢出，query 丢字段、event 向生产者抛错 | 实际 connector＋项目接缝：新增 2 failed /2 passed               |
| RV-048（已修复）                                | 同 port INIT7→INIT8 留旧路由，断开未撤销全部映射                 | 实际 wire guards/controller＋port 接缝：新增 2 failed /2 passed |

全部 Open，业务实现未修，负向断言保留。复验测量面分别标明，不能将 metadata 查询夹具等包装成真实业务 SQL/Chrome GUI。

## 2. 从源码到后端的实际核查

- [tree](results/packages/rxdb-plugin-tree.md)：TreeEntity/TreeRepository、选项/level、TreeHelper 与 merge_update；对照 where 所在递归项。Node target 只有 generator **4 passed**；独立浏览器 runtime **250 passed**，都不能证明 RV-046 已安全。
- [PGlite](results/packages/rxdb-adapter-pglite.md)：标量 title 条件在 children/c 两份列间歧义。最初 live probe 在第一快照就被 SQL error 阻断；改为直接 await 四个树方法，明确定位查询生成，不把前置失败说成增量漂移。
- [SQLite](results/packages/rxdb-adapter-sqlite.md) / [sqlite-core](results/packages/rxdb-adapter-sqlite-core.md)：正常 scalar alias；真实叶子 save 后比较 live 与 backend.findDescendants。hidden-parent 时 live 含 child、SQL 不含；visible-parent 对照一致。
- [DevTools](results/packages/rxdb-devtools.md)：三层授权/session 路由与 mask→serialize 的顺序。原整包 **994 passed**；新 changes 环覆盖到已有 self 安全测试没经过的预处理路径。
- [扩展](results/apps/rxdb-devtools-extension.md)：bridge origin/source/方向、background INIT/activation/map/disconnect、PortService 绑定发送。不同 port 替换守卫不等于同 port 重绑安全。

一个 endpoint 的 session 在构造时铸造、dispose 终态，未发现初步猜测的“同 endpoint 新 session 同 ID 被旧 provider 结果抢占”可达路径。没有将猜测列为 RV；其它迟到错误/订阅释放组合仍待核查。

## 3. 精确运行记录

| 执行面                           | 结果                             | 证据                                                                                |
| -------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| tree Node                        | 1 file /4 passed，只是 generator | [日志](evidence/2026-10-04/tree-devtools/rxdb-plugin-tree-baseline.txt)             |
| tree browser                     | 17 files /250 passed             | [日志](evidence/2026-10-04/tree-devtools/tree-browser-baseline.txt)                 |
| devtools 整包先行基线            | 44 files /994 passed             | [日志](evidence/2026-10-04/tree-devtools/rxdb-devtools-baseline.txt)                |
| PGlite 新六例                    | 4 failed /2 passed               | [日志](evidence/2026-10-04/tree-devtools/tree-scalar-filter-pglite.txt)             |
| SQLite 新两例                    | 1 failed /1 passed               | [日志](evidence/2026-10-04/tree-devtools/tree-filter-incremental-sqlite-linked.txt) |
| devtools boundary（含新四例）    | 2 failed /77 passed              | [日志](evidence/2026-10-04/tree-devtools/devtools-circular-changes.txt)             |
| extension background（含新四例） | 2 failed /23 passed              | [日志](evidence/2026-10-04/tree-devtools/extension-reinit-binding.txt)              |

无远端/本地 Nx 缓存，串行/maxWorkers=1，coverage 关闭。不拿旧 coverage 数字验收新测试，也没有剔除既有已确认问题去跑全包假绿。

## 4. 取证代码与依赖问题单独处理

SQLite 首次新 spec **0 tests**：consumer 未声明 tree workspace 包，不能把 import failure 当产品 tree bug。[原日志](evidence/2026-10-04/tree-devtools/tree-filter-incremental-sqlite.txt)。已先读取 link-workspace-packages skill，再用 pnpm 正式加 devDependency/workspace:*，没有新 tsconfig alias、没有手改 package.json 绕过链接。

[链接日志](evidence/2026-10-04/tree-devtools/sqlite-test-dependency-link.txt) / [锁文件语义对照](evidence/2026-10-04/tree-devtools/dependency-link-scope.json)：pnpm 重算 sqlite consumer 和 website 的两个 Docusaurus debug peer key；包版本 key 集合没有增删，lock 文本仍有 peer snapshot 去重，不能声称只改一个文本节点。既有 peer 版本告警与忽略 lifecycle 记录保留，不运行 approve-builds 或自动脚本。

新 SQLite spec 初次写错类型文件/导出名、extension mock 的未用形参告警已修测试本身。初始红门禁日志保留，不报成产品缺陷，不加入 any 或忽略规则。最终四个项目的 lint/typecheck 按本目录 final-quality 状态核销。

运行期间已有用户提交，且工作区出现范围外依赖清单/Cargo 等改动。只处理明确的 review 测试、文档与所需 devDependency，不回滚、不格式化这些外部改动，不将本批门禁视为新依赖全仓 CI 验收。

## 5. 仍待补证

- RV-045 修复后 PGlite 的同一增量序列；根/指定根、level/count、create/remove、多条变更及三框架视图。
- 环/深树/移动失败的完整合法性与原子性，没有因 CTE 存在 1000 层保护就默认审完。
- changes 图深度、共享引用、嵌套加密字段的输出；真实业务事件上可出现循环的模型路径。
- 重绑中的 pending injection/session 清理、真实 Chrome GUI/conformance、manifest/CSP/权限及 Electron 档位。
- 其它对象与 C 项继续按索引执行；本批不新增“全对象完成”标记。

## 最终门禁与快照

四个新增/修改测试的项目严格 lint、typecheck 均通过：[lint](evidence/2026-10-04/tree-devtools/final-quality-lint.txt) / [typecheck](evidence/2026-10-04/tree-devtools/final-quality-typecheck.txt)。负向断言未修，最终 focused 重跑记录保留。

[当轮任务汇总](evidence/2026-10-04/tree-devtools/round-results.json) · [源码/依赖版本快照](evidence/2026-10-04/tree-devtools/runtime-and-sources.json)。已复核的生产源码与开始基线字节相同；范围外依赖更新未回滚/格式化，不能据此代替其 CI。

## 后续：生成器、图与小程序第四批

[独立执行台账](execution-2026-10-04-generator-graph-miniprogram.md)：新增 RV-049～051 三个 P2，更新 4 个对象；历史与当轮测量面不混算。
