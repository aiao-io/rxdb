# Review：rxdb-taro

## 结论

🟡 二次评审发现 1 条 P3：抖音构建的 `use strict` 检查匹配整个 app.js 文本而非顶层指令，依赖产物里的字符串字面量会误杀构建。

## 检查范围

检查了 `package.json` 的 Node/Taro/Vite peer 与 `index`/`vite`/`runtime` exports、`project.json` build/typecheck/lint、README 的 weapp/tt/alipay 接入说明；走读 `assets-plugin.ts`、`build-target-plugin.ts`、`realm-plugin.ts`、`subframe-glue-plugin.ts`、`runtime.ts`、`constants.ts`、`vite.ts` 和 `src/__tests__/**`（资源发射、目标版本、真实全局对象绑定、Vite 配置及运行时入口）。二次评审额外核对了发射资产路径与运行时期望（WASM/worker/glue 文件名）、支付宝 worker 协议对称性与 realm 注入位置。

## 发现

### P3：抖音 `use strict` 检查匹配整个 app.js 文本，字符串字面量/注释/依赖内嵌指令会误杀构建

- 证据：`src/realm-plugin.ts:83` `if (platform === 'tt' && /["']use strict["']/.test(app.code))` 无锚定——匹配产物里**任意位置**的引号文本；同文件 `afterDirective`（`56` 行）对顶层指令用的是锚定正则 `/^\s*(["'])use strict\1;?/`，两处口径不一。
- 触发：任何依赖/业务代码在产物中生成 `var msg = "use strict";` 或注释/函数体内的 `'use strict'` 字面量 → 抖音构建失败并报误导性错误「入口 app.js 带了 use strict」（真实原因是字符串内容恰好命中）。
- 建议：与 `afterDirective` 同口径，用 `/^\s*(["'])use strict\1;?/` 锚定顶层检测。

## 风险/未覆盖

Taro `modifyRunnerOpts`、小程序开发工具和真机行为是外部契约；本轮未执行 Taro 4.3 在微信/抖音/支付宝工具链上的完整构建。

## 建议验证

执行 `pnpm nx run rxdb-taro:build`、`pnpm nx run rxdb-taro:typecheck`，并用 Taro 4.3 + Vite 在 weapp/tt/alipay 分别产出包，检查 wasm、realm 模块、目标版本和 app 配置。
