---
package: rxdb-taro
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# rxdb-taro 增量代码评审

## 结论

🟡 待处理：1 条 P3。上轮问题继续保留；本提交区间未提供关闭证据。本包实现源码未变，结论限于元数据/配置/文档增量及旧发现的变更核对；不代表依赖升级已完成行为回归。

## 提交与检查范围

- 上轮报告提交：`18ea576f`（2026-10-16，PR #128）；本轮检查到 `ffed57da`。逐包提交、全量增量统计与验证边界见 [本轮记录](./incremental-2026-10-26.md)。
- 本包变化：实现 0 文件、测试/测试工具 0 文件、配置/文档/版本 1 文件；以 Git 路径变化计，不把版本发布当成功能修复。
- 提交：`c425f414 chore(deps): safely upgrade workspace dependencies`；`23d8a098 chore(aiao): release 0.0.28 (#153)`。
- 检查重点：核对版本/依赖声明、构建配置与说明文档；实现源码无增量，旧问题保留原证据。

## 发现

### P3：抖音 `use strict` 检查匹配整个 app.js 文本，字符串字面量/注释/依赖内嵌指令会误杀构建

- 证据：`src/realm-plugin.ts:83` `if (platform === 'tt' && /["']use strict["']/.test(app.code))` 无锚定——匹配产物里**任意位置**的引号文本；同文件 `afterDirective`（`56` 行）对顶层指令用的是锚定正则 `/^\s*(["'])use strict\1;?/`，两处口径不一。
- 触发：任何依赖/业务代码在产物中生成 `var msg = "use strict";` 或注释/函数体内的 `'use strict'` 字面量 → 抖音构建失败并报误导性错误「入口 app.js 带了 use strict」（真实原因是字符串内容恰好命中）。
- 建议：与 `afterDirective` 同口径，用 `/^\s*(["'])use strict\1;?/` 锚定顶层检测。

## 验证与限制

本轮对本包执行静态增量检查，未单独运行其 lint/typecheck/test/build；不沿用旧报告的测试通过结论。

本轮环境为 Node `26.12.0`、pnpm `10.34.9`；旧报告的 Node 22 / Nx 插件加载限制已过时。未列出的任务与宿主验证不视为通过，统一边界见 [本轮记录](./incremental-2026-10-26.md#未覆盖)。
