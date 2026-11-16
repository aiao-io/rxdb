# Dashboard 大日志量优化记录

记录日期：2026-11-16。覆盖 T04，基线 `b52320402`。三端使用相同资产模型、主线程 sqlite-wasm + IndexedDB。原始指标见 [数据记录](evidence/dashboard-performance-2026-11-16.json)。

## 方法与事前预算

Chromium，每库 1,000 / 10,000 / 100,000 条真实 SQLite 日志，256 字符业务 payload，连续六条事务与单条操作混合。逻辑测量使用相同 Vite 宿主执行三端各自的数据库配置与活动源；UI 测量恢复同样的数据至三端 production 产物。每个测量创建独立浏览器上下文。

事前预算：100,000 条日志下，活动查询向 JS 返回 ≤ 5 行；活动流就绪 ≤ 1,000 ms；UI 显示五项活动并响应 ≤ 1,500 ms；JS 堆增量 ≤ 32 MiB。活动流从连接完成后订阅计时；UI 从恢复成功后点击 Dashboard 起计时，优化后还实际打开语言菜单验证响应。恢复、连接和首次索引初始化成本另列。允许 SQLite 内部扫描匹配日志，禁止用原始日志 `limit 5` 截断事务。

内存为查询前后 JS 堆差值，UI 测量先强制 GC；额外记录 backing storage，不能把 JS 堆解释为整个进程 RSS。一次本机样本用于预算验证，不是跨设备 SLA 或统计显著的速度承诺。

## 同数据前后对比

| 端      |  日志数 | 返回 JS 行数（前→后） | 原生查询 ms（前→后） | 活动流 ms（前→后） | 生产 UI ms（前→后） | UI 堆 MiB（前→后） |
| ------- | ------: | --------------------: | -------------------: | -----------------: | ------------------: | -----------------: |
| react   |   1,000 |             1,000 → 5 |            9.1 → 9.6 |        52.1 → 11.3 |       198.6 → 187.8 |        3.54 → 1.96 |
| react   |  10,000 |            10,000 → 5 |          63.6 → 53.9 |       374.3 → 56.7 |       536.5 → 253.7 |       34.47 → 1.26 |
| react   | 100,000 |           100,000 → 5 |        629.3 → 471.5 |     3695.4 → 473.8 |      3876.6 → 864.1 |      322.64 → 2.44 |
| angular |   1,000 |             1,000 → 5 |           8.2 → 10.4 |        48.0 → 14.4 |       184.9 → 158.6 |        3.39 → 1.04 |
| angular |  10,000 |            10,000 → 5 |          62.7 → 58.8 |       365.0 → 60.5 |       473.4 → 214.5 |       28.58 → 1.57 |
| angular | 100,000 |           100,000 → 5 |        626.3 → 486.0 |     3768.2 → 489.0 |      3824.1 → 829.7 |      323.13 → 1.98 |
| vue     |   1,000 |             1,000 → 5 |            9.8 → 9.7 |        49.2 → 13.1 |       139.1 → 178.4 |        3.35 → 0.74 |
| vue     |  10,000 |            10,000 → 5 |          59.8 → 55.8 |       358.8 → 59.3 |       438.6 → 264.8 |       28.57 → 1.30 |
| vue     | 100,000 |           100,000 → 5 |        603.2 → 468.3 |     3668.9 → 471.8 |      3680.8 → 840.0 |      338.38 → 2.09 |

十万条时，最终 JS 结果解析约 0.0–0.1 ms；用同一批实际 SQLite 行单独执行既有 JS 归一化约 14.8–21.9 ms。主要收益来自不再实例化十万条完整日志、登记实体缓存和传递 patch，并移除纯本地库多余的后台计数。不能将活动流耗时与原生查询耗时的差额全部称作聚合耗时。

十万条时活动流 JS 堆增量低于 1.2 MiB；生产 UI JS 堆增量低于 2.5 MiB，backing storage 增量低于 5 MiB。三端满足上述本机预算。

## 实现与语义

- 应用连接后安装 `(branchId, namespace, id DESC, transactionId, createdAt, entity)` 覆盖索引；通过现有表名解析器定位系统日志表。索引安装使用引导事务，避免插件反过来等待正在安装自己的 `connect()`。首页创建实例不安装索引、不连接空库。
- SQLite 先按过滤后的 ID 连续性识别操作边界，再按代表日志的时间与 ID 选择五个单元，最后对选中单元的完整 ID 区间聚合。事务代表时间取最大 ID 那条日志，与既有 JS 语义一致。
- 索引扫描仍随日志量增长，极大单个事务仍需读取其完整成员；不宣称数据库只扫描五行。只把最终五行结果交给 JS，保留完整 fingerprint、记录数、撤销与重做失效标记。
- 监听日志实体创建、更新与删除通知，同轮合并重查；条数不变的撤销和跨标签页更新也触发查询。切换分支或退订时撤销订阅，迟到结果不污染新分支。
- 公共历史插件复用 `buildPushableRepositoryRules` 判断同步资格，无可推送仓库时不建立无意义的计数触发查询；Full 同步与实例覆盖启用同步仍保留原规则。该公共包改动与三端应用一起验证、一起提交。

## 旧归档与成本边界

没有索引的旧归档恢复后首次连接，三端自动补齐索引。十万条时连接耗时分别为 react 1639.5 ms / angular 1638.9 ms / vue 1660.1 ms；随后活动流为 240.5 ms / 240.4 ms / 284.9 ms。这段一次初始化成本不包含在恢复成功后的页面预算中。数据库名、命名空间、VFS 与备份格式保持原有配置；索引增加数据库存储与日志写入维护成本。

## 验证与复验

三端同名查询、活动源、索引和懒加载测试逐字对齐。单测覆盖 513 条事务、跨常规分页边界、事务 ID 非连续复用、空事务 ID、过滤后连续性、低 ID 的较新时间、同毫秒、混合实体、分支隔离、撤销/失效更新、迟到查询和退订。测试实际执行 SQL，并与旧归一化结果逐字段比较。性能脚本还在真实 sqlite-wasm 上对每个数据规模做同样比较；生产 UI 九组测量均核对刷新后的活动与时间。

历史插件完整测试 458/458；覆盖率 statements 97.63%、branches 91.72%、functions 96.55%、lines 98.37%，四项均达到公共插件 80% 门禁。应用完整测试：React 72/72，Angular、Vue 各 69/69。受影响门禁与浏览器回归结果记录在 [总验收](nexus-dashboard-verification.md)。

从根目录执行，先构建依赖并启动已有目标（四个 server 命令分别保留在终端中；测量结束后停止，避免 E2E 端口冲突）：

```bash
NX_NO_CLOUD=true pnpm nx run-many -p rxdb-admin-template-react rxdb-admin-template-vue rxdb-admin-template-angular -t build --parallel=1 --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template-react:serve --excludeTaskDependencies --port=8315 --host=127.0.0.1
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template-react:preview --excludeTaskDependencies --port=8312 --host=127.0.0.1 --strictPort
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template-vue:preview --excludeTaskDependencies --port=8314 --host=127.0.0.1 --strictPort
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template-angular:serve-e2e
NX_NO_CLOUD=true pnpm nx exec --projects=@aiao/source --excludeTaskDependencies --skipRemoteCache -- node rxdb-admin-template/apps/react/scripts/profile-dashboard-activity.mjs seed /tmp/dashboard-seed.json
NX_NO_CLOUD=true pnpm nx exec --projects=@aiao/source --excludeTaskDependencies --skipRemoteCache -- node rxdb-admin-template/apps/react/scripts/profile-dashboard-activity.mjs logic /tmp/dashboard-logic.json
NX_NO_CLOUD=true pnpm nx exec --projects=@aiao/source --excludeTaskDependencies --skipRemoteCache -- node rxdb-admin-template/apps/react/scripts/profile-dashboard-activity.mjs ui /tmp/dashboard-ui.json
```

脚本支持 `PROFILE_FIXTURE_DIR`、`PROFILE_FRAMEWORK`、`PROFILE_SIZE`、`PROFILE_ORIGIN` 与 `PROFILE_UI_REACT/ANGULAR/VUE`。对比旧版本时，在独立的 `b52320402` 检出中安装工作区依赖并构建，使用同一份脚本与相同 seed 参数；旧端生成旧结构归档，最终端生成带索引结构的同数据归档。不要用优化后索引预热基线。临时归档与大体积产物不入库。

测量脚本在收尾时将浏览器回调、夹具下载和 UI 测量拆成独立函数，减少执行循环的嵌套。整理后用独立的 1,000 条夹具重跑 seed、三端 logic 以及 React 开发宿主 UI（含刷新比对），全部通过；日志 `/tmp/nexus-profiler-refactor-smoke.log`。该次用于脚本冒烟，未替换上表 production 测量或将开发宿主计时用于性能结论。脚本 lint 零警告。
