# Quickstart: BOM 第 8 步

日期：2026-10-16。范围：US-517、US-518、US-519 AC#1/#2/#4/#5/#6、US-521、US-525 阶段 E；US-523/阶段 F 留在下一阶段。

## 演示

```bash
pnpm nx serve dev-rxdb-bom
```

打开 `http://localhost:4311`，概览页重置并装载种子；共 41 个物料、42 个发生项、4 个历史批次。

- 概览：种子计数、物料清单与扩展属性面板；在 B-01 上验证 rohs 枚举与必填，按声明类型过滤。
- 展开：整机 SC-100 评估日设为 2026-10-16，unit=136/137 分别显示 UNIT-PART-OLD/UNIT-PART-NEW；清空显示子装配中的两个未解析候选；同一整机同时包含 B-01 与配置组件。ECN-2026-017 从该日接入三条新行。配置面板选红/蓝得到不同结构，同时选报互斥，不选报配置不完整。导出使用本页根物料、评估日、计划量与序列号；选择 JSON 文件原子导入，失败逐条点名 `source_ref`，成功后按显式日期发布。
- 时间轴、双图映射、成本卷算、反查延续原有行为，旧 17 条验收与阶段 E 四条一起回归。

## 公共 API 与边界

`rxdb.bom.resolve/expandBom/whereUsed/explodeBom/rollupCost` 共用 `ResolutionContext` 的配置、序列与批次；`manifest` 保留输入与候选。

`rxdb.bom.exportBom(context, target, options?)` 同快照读取结构、需求与主数据，拒绝截断或未解析结构，十进制保持字符串。替代组导出保留全部有效成员，需求数量仍反映调用方选择。

`rxdb.bom.importBomDraft(payload)` 接受 `kind/source_ref` 记录数组或导出载荷，返回 `{ committed, diagnostics, headerIds }`。逐行保存点收集全部诊断，任何失败回滚整批；不接收 ECN/history 旁路，不写已发布头。成功头保持草稿，由调用方显式发布；位号计数等聚合留在发布转移校验。

`rxdb.bom.filterByAttr(scope, filters)` 自动按属性声明确定比较类型；缺字段与 null 等价，`ne` 也不匹配；非法类型明确拒绝。

## 验证记录

- 插件：33 个 spec、554 条测试通过；SQLite/PGlite 使用相同真实存储与解析回归。
- 覆盖率：语句 94.79%、分支 85.04%、函数 93.82%、行 96.22%；四项均达到插件 80% 门禁。
- strict/lint：插件与依赖 30 个任务通过；最终六页应用的 lint/typecheck/test/build 共 36 个任务通过。
- 21 条演示 e2e：全部通过（阶段 A～E），保留原 17 条业务断言并按专项页面导航。
- 独立完整回归：React 演示 182 条 e2e、Supabase 适配器 612 条测试、DevTools 扩展 2 条 e2e 全部通过；网站生产 SSG 与完整构建通过。
- Electron 适配器文件串行验证：1266 条通过、8 条原配置跳过；独立 memory 2 条通过。并发超时按现有门禁约定串行复验，没有改业务或增加跳过。
- 最终 affected：83 个项目、341 个任务全部通过，298 项命中本地缓存，耗时 4m56s；结合上述 Electron 与 React 独立结果覆盖完整范围。
- API 基线、包图、需求一致性、构建入口及覆盖率五项审计、全分支格式检查通过。

完整范围按下列方式分段验证；所有 Nx 命令统一使用 Node 26，并设置 `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_NO_CLOUD=true ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`，保留本地缓存。

```bash
pnpm nx affected -t lint typecheck test test-memory test-browser build audit-lazy-backend e2e \
  --base=main --exclude=rxdb-adapter-electron,dev-rxdb-react-e2e \
  --output-style=static --skipRemoteCache --parallel=2 --nxBail
pnpm nx test rxdb-adapter-electron --fileParallelism=false --output-style=static
pnpm nx run rxdb-adapter-electron:test-memory --output-style=static
pnpm nx run dev-rxdb-react-e2e:e2e --output-style=static
```

门禁修复包括 React QueryBuilder 的 StrictMode 初值引用清理，以及 CodeEditor React 在库构建时显式使用生产 JSX。前者复用原失败的筛选弹层回归，后者复用原失败的网站 SSR；未改变公共 API。多条独立 Nx 命令同时重建共享 `dist` 曾导致临时模块缺失，停止竞争后完整串行复验通过。

## 性能测量

```bash
pnpm nx run benchmarks:benchmark-bom
```

基准在 PGlite memory 连接完成后进行，5 次预热、20 个样本；解析/展开/导出使用单层 100 行结构，单条保存使用序列与批次条件；整批导入测完整 BOM 层级的 1000 条记录。本机 Apple M1 Max / Node 26.12.0 实测 p95：解析 3.76ms、100 行展开 7.49ms、快照导出 15.88ms、单发生项保存 3.36ms；千行导入 1657ms。测量不包含启动与 fixture 准备，也不代表所有设备/图形的上界。结果包含环境、原始样本及 p50/p95/max，写入忽略的 `benchmarks/reports/bom-latest.json`。

Chromium 首屏实测：first-paint 24ms，first-contentful-paint 112ms；本地静态资源与全新浏览器上下文，不代表远程网络。

后端 DDL 延迟到连接阶段加载。构建产物入口与静态共享依赖 gzip 合计 47139 B，低于 50 KB 入口预算；连接时还会下载 15641 B DDL，完整能力累计 62780 B（gzip level 6，KB 按十进制），不把分块当作减少总字节。

PGlite 的 `ext` 物理列沿用引擎 JSON 文本映射，查询转换为 jsonb 实现比较语义；本步没有引入引擎级 JSON 类型映射或索引优化。
