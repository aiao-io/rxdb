# `dev-rxdb-tauri` 代码评审

## 结论

🔴 不通过。应用只注册 wa-sqlite adapter 却从未连接，首页又把“拿到 adapter”伪装成数据库 ready；当前状态页能绿，但数据库未必能用。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：`apps/dev-rxdb-tauri` 下 Angular renderer、wa-sqlite 初始化、Tauri bridge/Rust 配置、测试和 Nx 配置
- 自动校验：本轮仅完成只读代码审查，未为该项目单独运行 `lint`、`build`、`tauri-build` 或自动测试
- 测试现状：现有测试未覆盖应用启动后的 adapter 连接、建表/查询 smoke 或首屏 locale 冷启动时序

## 问题

| ID | 级别 | 位置 | 问题与影响 | 建议 |
| --- | --- | --- | --- | --- |
| TAURI-001 | P1 | `src/app/setup_rxdb_wa-sqlite.ts:62` | setup 最后只调用 `rxdb.init()`；整个项目没有 `connect('wa-sqlite')`。adapter 工厂被注册不等于数据库已连接，worker、WASM、VFS 和 Schema 初始化错误都不会在应用启动阶段暴露。 | 用 `provideAppInitializer` 或等价启动屏障显式 `await rxdb.connect('wa-sqlite')`，失败必须阻止 ready 状态并向 UI 传播。增加真实建表、写入、查询、断开 smoke test。 |
| TAURI-002 | P1 | `src/app/pages/home/home.page.ts:51` | 首页订阅 `localAdapter$` 一收到值就把 `databaseStatus` 设为 `ready`。该流只能证明 adapter 可被解析，不能证明连接、建表或一次 SQL 已成功；结合 TAURI-001，页面会稳定制造假健康状态。 | readiness 只能由已完成的连接 Promise 和最小数据库探针驱动；把 `checking/ready/error` 建模为单一状态源，禁止 UI 自行猜测底层生命周期。 |
| TAURI-003 | P2 | `src/app/app.config.ts:25` | `LOCALE_ID` 工厂启动异步 import 后立即返回 `zh`，`registerLocaleData()` 尚未完成。首屏若同步格式化日期/数字，会与 locale chunk 加载竞态并抛出缺失 locale data 或短暂使用错误格式。 | 在 bootstrap 前同步注册必要 locale，或通过可等待的应用初始化器完成动态加载后再渲染；补充中文冷启动格式化测试。 |

## 其余观察与测试缺口

- OPFS、SharedWorker 能力均不可用时会明确抛错，没有静默伪造可用存储；真正缺失的是启动连接闭环。
- 首页订阅已使用 `takeUntilDestroyed`，生命周期清理正确，但状态语义错误。
- 需要分别覆盖浏览器开发模式与 Tauri WebView；只在普通 Chromium 跑测试不能证明目标运行时支持对应 VFS/worker。

## 验收条件

- 应用 bootstrap 必须等待 `connect('wa-sqlite')`，连接失败时不得进入 ready，也不得吞掉错误。
- ready 前至少完成一次真实 Schema/SQL 探针；Tauri WebView 和浏览器模式均有自动或可重复 smoke test。
- 中文 locale 在首个 pipe/formatter 执行前已注册，不存在动态 import 竞态。
- 修复后执行 `pnpm nx lint dev-rxdb-tauri`、`pnpm nx build dev-rxdb-tauri`，并在具备 Tauri 工具链的环境运行 `tauri-build` 与启动 smoke test。
