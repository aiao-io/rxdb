# Review：@aiao/rxdb-model-react 评审

## 结论

🟢 未发现 P0-P2 问题。React 组件目录与 Angular/Vue 同功能面齐全，表格事件和 QueryBuilder 生命周期处理完整。

## 检查范围

检查 `src/entity-detail`、`entity-dialog`、`entity-form`、`entity-list`、`entity-table`、`query-builder` 及测试；核对 React/VTable/Lucide peer、CSS exports 和 `project.json`。

## 发现

无。`EntityTable` 用 props ref 接住 VTable 异步事件并在卸载时销毁 observer/tooltip/table；QueryBuilder 在 effect 创建服务、订阅 root/validation 并在 cleanup 取消（`src/query-builder/query-builder/query-builder.tsx:88-115`）。公开 `index.ts` 与 Vue/Angular 对齐导出组件类别。

## 风险/未覆盖

未覆盖 React concurrent rendering、真实 VTable Canvas、剪贴板权限和 Tailwind 构建；建议 Node 26+ 执行 typecheck/test/build 及浏览器验证。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
