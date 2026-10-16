# Review：@aiao/rxdb-model-vue 评审

## 结论

🟢 未发现 P0-P2 问题。Vue 组件公开面与 React/Angular 功能对齐，组合式状态和模板事件边界明确。

## 检查范围

检查 `src/entity-detail`、`entity-dialog`、`entity-form`、`entity-list`、`entity-table`、`query-builder`、Vue shim、spec 与 `index.ts`；核对 CSS/tailwind exports、Vue/VTable peer 和项目配置。

## 发现

无。组件对可选对象 props 的默认值采用 `withDefaults` 与类型注释保持一致；QueryBuilder/SubqueryBuilder 在 scope dispose 时取消 RxJS 订阅，异步事件不会落到已卸载组件；公开入口覆盖各功能组并导出 `cn`。

## 风险/未覆盖

未覆盖 Vue SSR/Teleport、真实 VTable 编辑器和 CSS tree-shaking；建议 Node 26+ 执行 test/typecheck/build 与浏览器验证。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
