# code-editor-angular 深度评审

评审日期：2026-10-29（更新轮；首轮 2026-10-28）。源码基线：`f62f77c19d55c73d8335df026778422282c2fed4`。范围：`packages/code-editor-angular`。首轮基线 `7bb16a9014095d4003bd059244722013b36867c1` 至本基线本包无源码变更。

## 结论

🟢 好。本次检查范围内未发现确定缺陷；新增问题 0 条。2026-10-29 更新轮抽查关键符号与链接，本更新轮未发现新的确定问题。

## 检查范围与证据

- 阅读 [`CodeEditor`](../../../packages/code-editor-angular/src/code-editor.ts) 的初始化、`ngOnChanges`、`writeValue`、`setDisabledState`、`setLanguage`、`setExtensions` 与 `ngOnDestroy`，以及[公开入口](../../../packages/code-editor-angular/src/index.ts)。
- CVA 首次写入建立值所有权，模板 value 不再覆盖表单；初始化前的值通过 `#pendingValue` 保留。表单禁用与 input 禁用取或，再在一次 dispatch 中同步只读、可编辑和 a11y 状态。
- `setLanguage` 将同步 throw 与异步 reject 汇合，并同时比较请求号与 view 身份；销毁先使请求失效再释放 view。

## 确定发现

无。已据当前源码复核历史的 CVA 覆盖、语言同步抛错、迟到回调和全局扩展替换问题，本次没有将这些已修问题重新登记。2026-10-29 复核：`#pendingValue` / `#formOwnsValue` / `setLanguage` / `setExtensions` / `ngOnDestroy` 等符号均在当前 HEAD 存在且与报告描述一致，报告链接全部有效。

## 公开 API 与三端对照

三端共享的 `view` / `host` / `focus` / `blur`、语言错误载荷、常用配置项语义一致。Angular 另保留 CVA 与 `setLanguage` / `setExtensions` 命令；React/Vue handle 没有这两个额外命令，这是现有 API 差异，不能据“导出名不相同”直接判定共享功能缺失。

## 值与回调的反证检查

`#formOwnsValue` 使首次 CVA writeValue 后的 value input 不再争夺文档；`ngOnInit` 消费 pendingValue，disabled/readOnly/a11y 经同一 dispatch 更新。语言 loader 的回调同时校验 request 与 view，ngOnDestroy 先使 request 失效，未发现能把 React Activity 的 effect 重放缺陷直接套到 Angular 生命周期的调用链。

## 验证与边界

重点核对 [`review-parallel-form-value.spec.ts`](../../../packages/code-editor-angular/src/__tests__/review-parallel-form-value.spec.ts) 与 [`review-language-sync-throw.spec.ts`](../../../packages/code-editor-angular/src/__tests__/review-language-sync-throw.spec.ts) 所覆盖的表单和值所有权、同步失败路径。

首轮（2026-10-28）`code-editor-angular:test`：79 passed (79)；目标实际执行。命令及整体边界见[总索引](README.md)。

边界：没有新增 Angular SSR、真实 Shadow DOM、IME 组合输入和屏幕阅读器验收。
