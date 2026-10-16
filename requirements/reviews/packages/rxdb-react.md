# Review：@aiao/rxdb-react 评审

## 结论

🟢 未发现 P0-P2 问题。查询 hooks 的内容 key、竞态取消、Provider 租约和同步状态快照均有明确生命周期处理。

## 检查范围

检查 `hooks.ts`、`query-options.ts`、`rxdb-react.tsx`、useAction/usePersistedState/useEntityChange/useSyncState 与测试；核对 React peer、exports、`project.json` typecheck 和 browser target。

## 发现

无。查询身份按内容而非对象引用计算并在 render 阶段复位状态（`src/hooks.ts:77-156`）；Provider 用租约处理 StrictMode 重新挂载与异步 source 所有权（`src/rxdb-react.tsx:117-220`）；游标实体按 orderBy 字段投影避免原型检查误伤（`src/query-options.ts:55-104`）。

## 风险/未覆盖

未覆盖 React 19 concurrent/suspense、真实浏览器 localStorage 与 browser target；建议在 Node 26+ 执行 test、browser、typecheck、build。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
