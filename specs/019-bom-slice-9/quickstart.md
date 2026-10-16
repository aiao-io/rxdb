# Quickstart: BOM 第 9 步

日期：2026-10-16。范围：US-523 AC#1～13、US-525 阶段 F。领域与页面验收已完成，分支门禁正在收口。

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

- 599 条领域用例分段验证：597 条常规回归与 2 条规模用例；新增持久化 A～E 库升级回归验证原主数据与展开不变，随后 F 层可用。
- SQLite / PGlite 各实际建立 1000 台、100000 个节点；主数据各表摘要、展开/反查结果及真实 EXPLAIN 计划前后相同，计划不涉及实例表。规模用例分别耗时 11.06s / 500.22s，包含准备、写入及对照验证。
- 当前覆盖率：语句 94.80%、分支 85.17%、函数 94.28%、行 96.32%，四项均超过插件 80% 门禁。
- 原 21 条页面业务断言保留，阶段 F 新增 2 条，共 23 条；首条同时验证首次空库状态。最终 lint/typecheck/e2e 共 43 个任务通过；API、包图、需求一致性、构建入口、覆盖率五项审计及格式检查通过；全分支门禁在收口后回写。

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

BOM 插件单项测试/覆盖率、lint/typecheck/build 与规模用例先完成，其余 affected 目标和 Electron 适配器再串行收口；不把分段验证描述为默认单条命令一次通过。
