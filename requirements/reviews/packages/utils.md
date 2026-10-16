# Review：@aiao/utils 评审

## 结论

🟢 未发现 P0-P2 问题。公共工具按领域分桶，关键并发/生命周期/持久化/加密/字符串边界均有测试。

## 检查范围

检查 `@browser`、array/async/crypto/cron/date/indexing/lifecycle/object/random/string/types 全部源码与 spec；核对顶层 index exports、package/project 配置和浏览器/Node 条件。

## 发现

无。`AsyncQueueExecutor` 对并发上限、任务去重、清队列和 drain 做了独立计数（`src/async/AsyncQueueExecutor.ts:65-193`）；`LifecycleScope` 逆序串行释放且缓存失败 Promise（`src/lifecycle/lifecycle-scope.ts:182-224`）；持久化 registry 对键转义、类型冲突和写盘失败可观测（`src/@browser/persisted-state.ts:173-313`）；JWT 文档明确只解码不验签（`src/crypto/decodeJWTPayload.ts:16-30`）。

## 风险/未覆盖

未覆盖 Safari/旧浏览器 Web Crypto、localStorage 配额/多标签同步、OPFS 和极大 Uint8Array 性能；需在浏览器矩阵和 Node 26+ 分别验证。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
