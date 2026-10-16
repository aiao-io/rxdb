# Review：@aiao/rxdb-model-angular 评审

## 结论

🟢 未发现 P0-P2 问题。实体详情/对话框/表单/列表/表格/QueryBuilder 的 Angular 入口与核心模型类型连接完整。

## 检查范围

检查 `src/entity-*`、`src/query-builder`、模板、测试替身及 `src/index.ts`；核对 ng-package、tailwind 导出、peerDependencies 与 `project.json` 的 Angular build/typecheck 配置。

## 发现

无。公开入口覆盖各组件和 `cn`；`tsconfig.spec.json` 以 project references 配合 `project.json` 的 `tsc --build`，避免 Angular 声明产物路径不一致。模板中的 `$any` 仅位于 DOM 事件/动态 VTable 边界，未在公开 TS API 扩散。

## 风险/未覆盖

未覆盖 Angular compiler 的真实模板诊断、CDK overlay、VTable 真实版本和移动端触摸拖放；建议 Node 26+ 执行 build/typecheck/test 与浏览器 e2e。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
