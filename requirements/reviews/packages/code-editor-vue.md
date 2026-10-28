# code-editor-vue 深度评审

评审日期：2026-10-28。源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。范围：`packages/code-editor-vue`。

## 结论

🟢 好。本次检查范围内未发现确定缺陷；新增问题 0 条。

## 检查范围与证据

- 阅读 [`CodeEditor.vue`](../../../packages/code-editor-vue/src/CodeEditor.vue)、[`CodeEditorProps` / `CodeEditorExpose`](../../../packages/code-editor-vue/src/code-editor.types.ts) 与[入口](../../../packages/code-editor-vue/src/index.ts)。
- 逐项检查 mounted 后配置应用、value 差量及 `External` / `addToHistory(false)`、语言身份去重、请求号与 view 身份守卫、unmounted 清理。
- `defineExpose.host` 依 view 是否存活返回元素，未把卸载后残留 DOM 引用报告成合法句柄；程序化更新不 emit 用户 change。

## 确定发现

无。源码中的语言同步 throw 已经过 try/catch 转成失败载荷，未重复登记历史问题。

## 公开 API 与三端对照

`CodeEditorProps` 与 React 共享的配置逐项对应；Vue 的 `update:value` 是 v-model 通道，`change` 和 `language-error` 分别对应另外两端的用户编辑和语言失败通道。暴露的四项命令式 API 与 React 对齐。

## 生命周期反证检查

`onMounted` 用当前 props.value 建状态，`onUnmounted` 清空 viewRef 并推进 languageRequest；KeepAlive 停用没有调用该卸载清理，不能据 React 的 Activity 复现断言 Vue 也会同样重建丢文档。语言配置去重与在途请求守卫分别按 description 和 view 身份执行。

## 验证与边界

对照 [`CodeEditor.document-sync.spec.ts`](../../../packages/code-editor-vue/src/__tests__/CodeEditor.document-sync.spec.ts)、[`CodeEditor.language.spec.ts`](../../../packages/code-editor-vue/src/__tests__/CodeEditor.language.spec.ts) 和 [`review-language-sync-throw.spec.ts`](../../../packages/code-editor-vue/src/__tests__/review-language-sync-throw.spec.ts) 的差量、竞态及异常入口。

本次 `code-editor-vue:test`：68 passed (68)；目标实际执行。命令及整体边界见[总索引](README.md)。

边界：未运行真实 KeepAlive 激活/停用组合、Shadow DOM 和 IME 验收；Vue 没有 React Activity 的同一 effect 重放路径，不能直接套用 React 问题。
