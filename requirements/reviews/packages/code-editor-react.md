# Review：@aiao/code-editor-react 评审

## 结论

🟢 未发现 P0-P2 问题。React 组件正确处理 StrictMode 重挂载、受控值差量同步、回调引用和异步语言竞态。

## 检查范围

检查 `src/CodeEditor.tsx`、测试套件和 README；核对 `package.json` exports、React peer 版本、`project.json` typecheck 目标；对照 Angular/Vue 的 props、错误回调和命令式 handle。

## 发现

无。组件用 `useLayoutEffect` 更新回调 ref（`src/CodeEditor.tsx:323-334`），用 view 绑定的已生效语言结果避免 StrictMode 空 Compartment（`src/CodeEditor.tsx:303-311,464-515`），外部写入禁止进入 undo 历史（`src/CodeEditor.tsx:227-235`）。

## 风险/未覆盖

未覆盖真实 React 19 concurrent rendering、ShadowRoot 和浏览器焦点/IME；建议在 Node 26+ 执行 React 包 test、typecheck、build 以及浏览器目标。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
