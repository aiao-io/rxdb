# rxdb-taro 深度评审

评审日期：2026-10-28。源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。范围：`packages/rxdb-taro`。

## 结论

🟢 好。本次检查范围内未发现确定缺陷；新增问题 0 条。

## 检查范围与证据

- 阅读全部八个生产模块：[Taro 插件入口](../../../packages/rxdb-taro/src/index.ts)、[`miniProgramVitePlugins`](../../../packages/rxdb-taro/src/vite.ts)、[`taroMiniProgramRuntime`](../../../packages/rxdb-taro/src/runtime.ts)、[`miniProgramAssetsVitePlugin`](../../../packages/rxdb-taro/src/assets-plugin.ts)、[`realmVitePlugin` / `realmCaptureSource`](../../../packages/rxdb-taro/src/realm-plugin.ts)、[glue 转换](../../../packages/rxdb-taro/src/subframe-glue-plugin.ts)、[构建目标选择](../../../packages/rxdb-taro/src/build-target-plugin.ts) 与[常量](../../../packages/rxdb-taro/src/constants.ts)。
- 校验平台与编译器在入口失败，保留已有 vitePlugins；WASM 沿 adapter 的依赖解析，避免加载器和二进制错配。
- realm 插件对入口登记、子 chunk 相对 require 路径及严格模式入口的拒绝均有显式处理；glue 转换仅匹配特定上游模块。

## 确定发现

无。没有把未支持平台的显式拒绝、支付宝需要额外 Worker 的已说明配置或“用户指定 target 不覆盖”误报成 fallback 缺陷。

## 公开 API 与三端对照

本包是构建/小程序运行时桥接，不属于 Angular/React/Vue 三端同名包装组。Taro 插件与 runtime 只支持微信/抖音；vite 组装可处理支付宝，其额外要求在源码与 README 中明确。

## 公开子路径与宿主边界

除包根之外，vite/runtime 子路径分别承担构建插件与宿主适配。平台选择先于资源装配，assets 从 adapter 的依赖解析 WASM；realm 插件按 chunk 所在目录生成相对 require，并在不安全的抖音 strict 入口明确报错。未把“不实际驱动开发者工具”的验证缺口冒充构建缺陷。

## 验证与边界

检查八类入口对应的测试文件，重点包括 [`realm-plugin.spec.ts`](../../../packages/rxdb-taro/src/__tests__/realm-plugin.spec.ts)、[`assets-plugin.spec.ts`](../../../packages/rxdb-taro/src/__tests__/assets-plugin.spec.ts)、[`runtime.spec.ts`](../../../packages/rxdb-taro/src/__tests__/runtime.spec.ts)。

本次 `rxdb-taro:test`：72 passed (72)；目标实际执行。命令及整体边界见[总索引](README.md)。

边界：本次没有打开微信/抖音/支付宝开发者工具，没有做 iOS/Android 真机或发布构建。因此插件单测通过不能充当宿主兼容性验收；支付宝 runtime 仍按明确的手动组装路径评估。
