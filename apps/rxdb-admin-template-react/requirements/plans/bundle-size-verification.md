# 三端构建体积与后端懒加载验收

记录日期：2026-11-16。覆盖 T05，基线 `b52320402`。前后使用相同 production 构建与 source map / manifest / stats 配置。原始文件名与数值见 [产物记录](evidence/bundle-size-2026-11-16.json)。

## 首屏成本

首屏 JS = HTML 入口与递归静态 imports 的文件之和，排除动态 imports；gzip 使用同一 Node 26 的 `gzipSync({ level: 9 })` 按文件求和。不能只比较 main 文件，也不能拿不同压缩器的显示值混算。

| 端      | 首屏原始 JS bytes（前→后） | gzip bytes（前→后） |         gzip 减少 |
| ------- | -------------------------: | ------------------: | ----------------: |
| angular |      1,214,720 → 1,123,581 |   342,301 → 315,605 |  26.1 KiB（7.8%） |
| react   |        1,074,605 → 835,947 |   338,601 → 264,791 | 72.1 KiB（21.8%） |
| vue     |          864,673 → 625,834 |   281,759 → 207,422 | 72.6 KiB（26.4%） |

三端 CSS 未因本轮逻辑优化减少：React 186,810 bytes、Vue 185,951 bytes、Angular 427,920 bytes。数据库名、存储前缀与 IndexedDB VFS 保持原配置；Angular 的 WASM URL 仍由宿主 base URI 解析。

## Dashboard 与主要依赖

以下为各动态入口自身的原始 bytes / gzip bytes，不重复累计共享 imports。数据库后端原先在首屏入口中，优化后为独立动态入口。

| 端      |                 Dashboard 前→后 | 数据库后端（优化后） |   VFS（优化后） | 实体表格页（优化后） |
| ------- | ------------------------------: | -------------------: | --------------: | -------------------: |
| angular | 11,729 / 3,813 → 12,894 / 4,409 |      90,544 / 28,698 | 96,610 / 29,267 |  2,409,111 / 604,422 |
| react   |  8,618 / 2,610 → 10,280 / 3,400 |     241,848 / 77,164 | 95,013 / 28,279 |  2,186,792 / 543,040 |
| vue     |  8,895 / 3,037 → 10,679 / 3,862 |     241,851 / 77,143 | 95,013 / 28,280 |  2,196,275 / 547,496 |

Dashboard 小幅增加来自 T04 的完整操作单元 SQL 与响应式接线。首屏节省不是删除功能：进入 Dashboard 后仍会请求后端、VFS 和 WASM。React/Vue 从初始图中移出了适配器基类与引擎；Angular 仍有部分 sqlite-core 基类代码在初始共享 chunk 中，只移出了引擎和适配器入口。搜索插件静态使用 sqlite-core 的 FTS 工具是仍存在的引入链之一，不能据此宣称全部 SQLite 代码已离开首屏。

大体积实体表格入口仍约 2.19–2.41 MB，来自应用实体页经 rxdb-admin / rxdb-model 的 VTable 与 VRender 依赖链。该页面继续独立懒加载。后续更换表格渲染器涉及公共包能力与交互面，需要单独范围评审，本轮没有替换它。

## 浏览器实际请求

每端三个独立上下文，Chromium CDP 关闭网络缓存；从首页进入空库 Dashboard。下表为一个样本的 JS encoded body 之和，Angular 静态 server 与 Vite preview 的传输压缩设置不同，只作同端前后对比。Dashboard 列是首页加 Dashboard 的累计 JS。

| 端      | 首页实际 JS bytes（前→后） | 进入 Dashboard 累计 JS bytes（前→后） | 首页 WASM |
| ------- | -------------------------: | ------------------------------------: | --------: |
| angular |      1,215,857 → 1,124,718 |                 1,324,195 → 1,324,766 |     0 → 0 |
| react   |          340,144 → 266,264 |                     371,104 → 375,611 |     0 → 0 |
| vue     |          283,230 → 208,797 |                     314,593 → 318,587 |     0 → 0 |

三端在 Dashboard 连接后才请求一个 WASM。共享浏览器测试为首页零 WASM、Dashboard 连接完成后恰好一次 WASM 增加了断言。三端新单测验证创建工作台不加载后端，首次并发取得适配器只加载一次且不连接空库；原有备份恢复测试继续覆盖连接前恢复。

本机三次计时的中位数（首页 / 进入空库 Dashboard，ms）：angular 123.8/220.7 → 123.2/223.3；react 146.6/238.3 → 138.2/247.6；vue 121.1/241.0 → 113.7/229.5。样本太少，不用这些数值宣称稳定的启动加速。明确收益是首屏字节减少，后续页面承担被推迟的加载成本。

## 告警归因

- Angular 应用仍有 `ms`、`gifuct-js`、`lottie-web`、`cssfontparser`、`geojson-dissolve`、`geobuf` 的 CommonJS 提示；后五项属于表格/图形依赖链。
- Vite 的大 chunk 来自首屏公共代码与实体表格页；`lottie-web` 直接 `eval` 来自 VRender 图形依赖。相关依赖构建还报告 PGlite `eval`，不能把依赖构建告警直接等同为首屏执行。
- 没有提高 chunk 阈值、扩充 CommonJS 忽略列表或屏蔽 eval 告警。T05 完成的是实际首屏减重、引入链定位与回归，不宣称第三方告警归零。

## 复验

先完成普通测试/类型检查，再连续执行以下分析构建与审计，避免其他默认构建覆盖 manifest 或 source maps：

```bash
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template-react:build --sourcemap --manifest --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template-vue:build --sourcemap --manifest --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template-angular:build --stats-json --source-map --skipRemoteCache
NX_NO_CLOUD=true pnpm nx exec --projects=@aiao/source --excludeTaskDependencies --skipRemoteCache -- node apps/rxdb-admin-template-react/scripts/audit-lazy-backend.mjs
```

应用专用审计解析静态图与 source maps，断言 Dashboard 和 SQLite 适配器入口均为动态入口、引擎源码未进入首屏静态图。它不以桌面端 `audit-lazy-backend` 结果代替 Web 结论。

按 [性能记录](dashboard-performance-verification.md) 启动三端 preview / serve-e2e 后执行：

```bash
NX_NO_CLOUD=true pnpm nx exec --projects=@aiao/source --excludeTaskDependencies --skipRemoteCache -- node apps/rxdb-admin-template-react/scripts/profile-startup.mjs /tmp/startup-network.json
```

最终静态检查、单测、完整浏览器回归与需求门禁结果见 [总验收](nexus-dashboard-verification.md)。
