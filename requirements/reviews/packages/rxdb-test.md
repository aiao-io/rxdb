# Review：@aiao/rxdb-test 评审

## 结论

🟢 未发现 P0-P2 问题。测试 fixtures、跨框架契约套件、公开 contract 校验和生成产物入口一致。

## 检查范围

检查 entities/shop fixtures、`src/testing`、encrypted/query-cache/sortable/tree-unique/check-constraint/transaction suites、`public-contract`、`scripts/verify-public-contract.mjs`、`vite.config.mts` 和 package exports。

## 发现

无。Vite 多入口与 `package.json` 子路径 exports 对应，构建结束会生成并检查 entities/shop；`build` 同时运行 public contract 与 publish tsc（`packages/rxdb-test/vite.config.mts`、`project.json:build`）；共享 suite 与 spec 分离，coverage 配置排除 suite，避免把被适配器重复执行的套件计入本包。

## 风险/未覆盖

未覆盖所有适配器矩阵、真实浏览器/移动宿主和长时并发压力；本包本身是测试资产，不应把单独 suite 运行结果等同于全适配器通过。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
