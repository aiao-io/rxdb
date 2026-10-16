# Review：@aiao/rxdb-angular 评审

## 结论

🟢 未发现 P0-P2 问题。Provider、Angular signals、查询 hooks、CVA/变更检测和同步状态面接口清晰。

## 检查范围

检查 `rxdb.provider.ts`、`hooks.ts`、`use-state.ts`、`use-persisted-state.ts`、`use-sync-state.ts`、`use-infinite-scroll.ts`、directive/list 组件与测试；核对 ng-package、peerDependencies 和 `project.json` typecheck/build。

## 发现

无。`provideRxDB` 对 Promise/工厂吸收创建异常并在 holder 中延迟抛出（`src/rxdb.provider.ts:56-99`）；表单/输入禁用语义由核心组件统一；持久化状态使用 root registry 和转义键，避免 lazy injector 销毁 effect（`src/use-state.ts:95-157`）。

## 风险/未覆盖

未覆盖 Angular 22 SSR、路由级 EnvironmentProviders、真实 Zone-less 变更检测；建议在 Node 26+ 执行 Angular compiler/typecheck/test/build。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
