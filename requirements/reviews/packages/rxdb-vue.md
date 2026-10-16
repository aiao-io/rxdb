# Review：@aiao/rxdb-vue 评审

## 结论

🟢 未发现 P0-P2 问题。Vue provider/ref、查询 hooks、持久化和同步状态与 React/Angular 的公开语义对齐。

## 检查范围

检查 `rxdb-vue.ts`、`hooks.ts`、`useInfiniteScroll.ts`、useAction/usePersistedState/useEntityChange/useSyncState、测试与 README；核对 Vue peer、exports、lint/typecheck targets。

## 发现

无。异步 source 只在 provider 自己创建的实例上执行 shutdown，调用方传入的 Ref/实例不接管（`src/rxdb-vue.ts:105-145`）；查询订阅在 scope dispose 时清理，错误写入资源而非逃出副作用；游标选项复用 `@aiao/utils` key 实现。

## 风险/未覆盖

未覆盖 Vue SSR、KeepAlive/嵌套 effect scope、浏览器端异步 provider 竞态；建议在 Node 26+ 执行 test、lint、typecheck、build。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
