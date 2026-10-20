# Quickstart: BOM 第 9 步

日期：2026-10-16～17。范围：US-523 AC#1～13、US-525 阶段 F。领域、页面与分支门禁已按下述分段方式完成。

## 演示

```bash
pnpm nx serve dev-rxdb-bom
```

打开 `http://localhost:4311`。首次空库显示“未装载种子”，不会写入悬空演示修订。概览装载后共 41 物料、43 发生项、4 历史批次、5 条安装事实；通过“实例追溯”查看第七页。

- 两台 SC-100：SN-001 / SN-002，分别装 PACK-001 / PACK-002，批次 PACK-LOT-A；实际修订均为 A。
- 在 2026-11-01 为 SN-001 记录换件：PACK-001 截止，PACK-003 同时开始，批次 PACK-LOT-B。时点前后与全历史均可查，SN-002 保持原样。
- 按电池序列号或批次反查整机路径；主数据 BATT:B 在显式未来日期发布后，相同时点的安装事实不变，刷新后仍可查。
- SN-002 的 CELL 来源是草稿发生项；直连删除被拒，消息包含发生项 ID 与引用数 1。

## 公共合同

`BomInstanceNode` 一行记录一次安装：实际 `itemRevisionId`、`serialNumber` / `lotCode`、父实例、来源、`installedAt` / `removedAt`。根来源可空，子节点来源必填；序列化实际物料必须有序列号。同序列号的安装区间全局互斥，恰好相邻接受；换父/重装先截止旧行再新增，固定事实不可改写。

`rxdb.bom.expandInstance(rootId, options?)` 返回事实节点、层级、路径与 `truncated`；`whereUsedInstance(target, options?)` 按序列号、批次或实际修订精确匹配，组合条件为 AND，返回命中、顶层根与完整祖先路径。没有时点读取历史，有时点按 `[installedAt, removedAt)` 筛选整条路径，不读系统时钟。默认深度 64、节点预算 10000，触顶显式截断。

实例只读自身事实与实际修订，不重新解析来源。来源删除保护覆盖草稿直接删除、ECN 撤回/取消，并统计已拆卸历史；发生项仓储删除使用同一事务，拒绝后全部子表与状态不变。实际数量/单位、稳定实物 ID、维修工单和可复用三框架绑定仍按各自范围排期。

## 验证记录

- 38 个文件、599 条领域用例分段验证：597 条常规回归与 2 条规模用例；新增持久化 A～E 库升级回归验证原主数据与展开不变，随后 F 层可用。
- SQLite / PGlite 各实际建立 1000 台、100000 个节点；主数据各表摘要、展开/反查结果及真实 EXPLAIN 计划前后相同，计划不涉及实例表。规模用例分别耗时 11.06s / 500.22s，包含准备、写入及对照验证。此为 2026-10-16 的一次性实跑；2026-10-17 起 `bom-instance-scale.spec.ts` 的常驻回归降为 100 台 / 10000 个节点（PGlite 1000 台在 CI 上超过 10 分钟）。主数据查询计划不引用实例表，隔离断言与实例数量级无关，因此保留常驻回归的规模，不把 10 万写成每轮都在验证。
- 当前覆盖率：语句 94.80%、分支 85.17%、函数 94.28%、行 96.32%，四项均超过插件 80% 门禁。
- 原 21 条页面业务断言保留，阶段 F 新增 2 条，共 23 条；首条同时验证首次空库状态。最终 lint/typecheck/e2e 共 43 个任务通过；API、包图、需求一致性、构建入口、覆盖率五项审计及格式检查通过。
- 首轮 affected：83 个项目、336 个任务，72 个缓存命中，耗时 27m46s。Vue e2e 为 164 条通过、1 条失败，Invoice 保存弹层 5 秒内未关闭，`nxBail` 后另有 5 个目标未执行。
- 修复后的剩余 run-many：7 个项目及 79 个依赖任务，共 103 个任务通过，84 个缓存命中，耗时 3m45s。包括 Vue 165 条 e2e、应用 228 条单测、模型 326 条单测；HTTP 23 条 e2e、Supabase 4 条 e2e、扩展 2 条 e2e，以及 Supabase 41 个文件、612 条测试。
- Electron 独立分段通过：lint/typecheck/build 共 28 个任务，25 个缓存命中；完整测试为 37 个文件、1266 条通过、8 条原有跳过，耗时 8m38s，12/14 个任务命中缓存；memory 为 2 个文件、2 条测试通过，耗时 2m28s，12/14 个任务命中缓存。

Vue 首轮失败由普通文本字段使用 `@change` 延迟同步引起：重绘清空 Invoice 标题，保存触发数据库 NOT NULL 拒绝。确定性单测先复现空输入，再将默认文本输入改为 `@input` 同步。Vue 模型 16 个文件、326 条测试及 lint/typecheck/build 共 35 个任务通过，29 个缓存命中，耗时 21.5s；覆盖率为语句 90.41%、分支 85.65%、函数 83.39%、行 91.90%。已有 e2e 断言辅助函数 `expectFitsHorizontally` 登记到 `assertFunctionNames` 后，`--max-warnings=0` 的 lint 复验通过（1 个目标，1.5s）。

```bash
pnpm nx test rxdb-plugin-bom --testNamePattern='^(?!.*实例图规模隔离)' --coverage --coverage.reporter=text --coverage.reporter=json-summary
pnpm nx test rxdb-plugin-bom --testNamePattern='实例图规模隔离'
pnpm nx run dev-rxdb-bom-e2e:e2e --output-style=static
```

## 性能

```bash
pnpm nx run benchmarks:benchmark-bom --output-style=static
```

Apple M1 Max / Node 26.12.0 / PGlite memory，连接与 fixture 准备后预热 5 次、采样 20 次，按 nearest rank 取 p95。实例树为单层 100 节点，反查为序列号点查；原主数据基准为单层 100 行。

| 路径             | p95     | 预算  |
| ---------------- | ------- | ----- |
| 主数据解析       | 4.41ms  | 16ms  |
| 100 行数量展开   | 7.27ms  | 16ms  |
| 同快照导出       | 14.61ms | 16ms  |
| 发生项保存       | 2.99ms  | 100ms |
| 100 节点实例展开 | 3.28ms  | 16ms  |
| 序列号反查       | 1.54ms  | 16ms  |
| 实例保存         | 1.23ms  | 100ms |

千条导入：1596.59 ms。完整原始样本与环境写入忽略的 `benchmarks/reports/bom-latest.json`。首轮导出 p95 16.75ms 超预算，改为每行只构造一次自然排序键后，复测 14.61ms；排序与快照合同保持一致。

Chromium 首屏 first-paint 44ms / FCP 148ms；测量使用本地静态资源与全新浏览器上下文。上述值有明确数据形状与测量边界，批量规模用例和单条操作分别计时。

入口及静态共享依赖 gzip 48797 B，低于 50000 B；连接 DDL 与实例查询分别按需加载。全部主入口可达分块合计 68136 B（gzip level 6，包含静态与动态依赖，外部包依赖另计）。

## 门禁方式

统一环境：`NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_NO_CLOUD=true ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`。所有构建与测试通过 Nx，保持本地缓存；重负载目标分段，避免共享 dist 同时重建。

以下是实际使用的首轮 affected、剩余目标和 Electron 命令；均使用上述统一环境，并保留本地缓存。

```bash
pnpm nx affected -t lint typecheck test test-memory test-browser build audit-lazy-backend e2e --base=main --exclude=rxdb-plugin-bom,rxdb-adapter-electron --output-style=static --skipRemoteCache --parallel=2 --nxBail

pnpm nx run-many -t lint typecheck test test-browser build audit-lazy-backend e2e --projects=rxdb-model-vue,dev-rxdb-vue,dev-rxdb-vue-e2e,dev-rxdb-http-e2e,dev-rxdb-supabase-e2e,rxdb-devtools-extension-e2e,rxdb-adapter-supabase --parallel=1 --nxBail --output-style=static --skipRemoteCache

pnpm nx run-many -t lint typecheck build --projects=rxdb-adapter-electron --parallel=1 --output-style=static
pnpm nx test rxdb-adapter-electron --fileParallelism=false --output-style=stream
pnpm nx run rxdb-adapter-electron:test-memory --output-style=stream

pnpm nx run dev-rxdb-vue-e2e:lint --max-warnings=0
pnpm nx run rxdb-adapter-supabase:test-env-down
```

本轮以分段验收完成：BOM 常规/规模/覆盖率与页面回归先完成，首轮 affected 的真实 Vue 缺陷修复后补齐其余目标，Electron 单独串行验证。首轮 affected 未一次通过；各段包含重复依赖，任务数分别报告、不相加。上述分段门禁现已全部完成，当前 checkout 的 Supabase 隔离容器与网络已清理。
