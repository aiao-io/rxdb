# Review：@aiao/code-editor-vue 评审

## 结论

🟢 未发现 P0-P2 问题。Vue watch 的生命周期、受控值同步、语言请求号和 a11y 属性更新与另外两端对齐。

## 检查范围

检查 `src/CodeEditor.vue`、`code-editor.types.ts`、类型 shim、测试套件和 README；核对 `package.json` exports、Vue peer 版本及 `project.json` 的 lint/typecheck 目标。

## 发现

无。`value` watch 使用核心最小差量并关闭 undo（`src/CodeEditor.vue:145-163`）；语言 watch 以 description identity 去重且在卸载时推进请求号（`src/CodeEditor.vue:198-240`、`138-143`）；`defineExpose` 的 view/host/focus/blur 面与 React/Angular 对齐。

## 风险/未覆盖

未覆盖 Vue 3.5 SSR、Teleport/ShadowRoot 和真实浏览器焦点事件；建议在 Node 26+ 执行 test、lint、typecheck、build。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
