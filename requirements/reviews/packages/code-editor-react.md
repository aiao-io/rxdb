# code-editor-react 深度评审

评审日期：2026-10-28。源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。范围：`packages/code-editor-react`。

## 结论

🟡 凑合。发现 1 条 P1：生产环境 Activity 隐藏再显示会丢弃未回写到 value 的用户文本。

## 检查范围与证据

- 阅读 [公开 props/handle 与 `CodeEditor`](../../../packages/code-editor-react/src/CodeEditor.tsx)、[入口](../../../packages/code-editor-react/src/index.ts)，对比 Angular/Vue 的文档所有权、语言请求与销毁路径。
- 检查 callback 在 layout effect 中更新、语言请求号与 view 身份双重守卫、StrictMode 重建时语言状态的绑定对象、非严格受控 value 合同。
- 重点核对 [`review-continuation-lifecycle.spec.tsx`](../../../packages/code-editor-react/src/__tests__/review-continuation-lifecycle.spec.tsx)；它覆盖 StrictMode 与卸载后 loader，未覆盖编辑之后 Activity 隐藏再显示的文档保留。

## 确定发现

### CER-20261028-01 [P1] Activity 重建从初始 value 恢复，丢失用户文档

证据：[`CodeEditor` 的 `initialConfigRef` 与创建 EditorView 的 effect](../../../packages/code-editor-react/src/CodeEditor.tsx) 捕获 `{ autoFocus, disabled, readonly, root, value }`，每次 effect 接通都执行：

```ts
const state = EditorState.create({ doc: initialConfig.value, extensions });
```

清理只调用 `view.destroy()`，没有保存 `view.state`。组件明确承诺 `value` **不是严格受控**，允许宿主忽略 onChange 后继续保留编辑器内部输入。

最小触发：`<Activity mode={mode}><CodeEditor language="plaintext" setup={null} value="initial" /></Activity>`；用户输入使文档变为 `initial!`；将 mode 从 visible 切到 hidden，再切回 visible。预期继续显示 `initial!`；实际显示 `initial`。即便宿主回写当前文本，重建也会丢掉选区和撤销历史，因为恢复的是字符串而非 EditorState。

复验：使用当前真实组件源码、React 19.3.1、React DOM 与 happy-dom 的只读 Node 隔离脚本；esbuild 仅在内存中转译，核心包指向当前源码，未替换 EditorView。真实 `view.dispatch` 编辑后执行 Activity 切换，输出为：

```text
before hide: initial!
after show: initial
```

影响：Activity 可在生产中用于保留页面状态，隐藏编辑中的页签后回来会丢失尚未提交文本；StrictMode 首次双挂载的绿测不能覆盖这一条。

修复建议：将当前 EditorState 的生命周期与组件状态绑定；effect 清理前保存完整状态，重新接通 view 时从保存状态恢复，同时明确处理隐藏期间外部 value 的变化。不要在 effect 重建时固定读取首次 value。

建议回归：未受控输入、受控回写、隐藏期间 value 改变三组；同时断言文本、选区、undo 历史和迟到语言回调只作用于新 view。

## 公开 API 与三端对照

公共配置和错误载荷与另外两端对齐，React 使用 callback prop 的命名差异属于框架惯例。此次差异是内部状态在 effect 断开后是否保留，不能靠 index.ts 导出检查发现。

## 验证与边界

运行了上述真实 Activity 隔离复现；没有提交新测试，也没有修改实现。已有回归中的“StrictMode 销毁两次”“卸载后 loader 不再 dispatch”“父 layout effect 使用新回调”均作为已实现防护审阅。

本次 `code-editor-react:test`：41 passed (41)；目标实际执行。命令及整体边界见[总索引](README.md)。

边界：复现使用 happy-dom，没有完成真实浏览器中的 IME、滚动与辅助技术验收。问题不依赖网络或某个语言 parser。
