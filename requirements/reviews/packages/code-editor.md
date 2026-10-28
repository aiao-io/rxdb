# code-editor 深度评审

评审日期：2026-10-28。源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。范围：`packages/code-editor`。

## 结论

🟢 好。本次检查范围内未发现确定缺陷；新增问题 0 条。

## 检查范围与证据

- 阅读全部六个生产模块：[入口](../../../packages/code-editor/src/index.ts)、[`computeMinimalDocumentChange`](../../../packages/code-editor/src/document-sync.ts)、[`resolveCodeEditorLanguage` / `isSameResolvedLanguage`](../../../packages/code-editor/src/language-resolution.ts)、[语言描述与 `findLanguageByName`](../../../packages/code-editor/src/languages.ts)、[结构化错误载荷](../../../packages/code-editor/src/language-error.ts)、[无障碍属性计算](../../../packages/code-editor/src/accessibility.ts)。
- 文档差量按公共前后缀收缩，`current === next` 返回 `null`；检查空串、前缀追加、尾部删除与 UTF-16 字符串坐标的适配关系。
- 语言选择比较实际 description 身份，区分关闭高亮与配置错误；`overrideLanguage` 合并上游别名、扩展名与 filename，未重新发现历史元数据丢失问题。

## 确定发现

无。React 生命周期里的文档丢失发生在绑定层，单独记在 [code-editor-react](code-editor-react.md)，不能归罪于差量算法。

## 公开 API 与三端对照

Angular、React、Vue 均调用同一份差量、语言解析、错误载荷和无障碍工具，纯逻辑没有三份分叉。`CodeEditorTheme` 是核心共享类型，各绑定均提供同名入口。

## 公开入口与纯逻辑边界

`index.ts` 只导出共享纯工具、语言描述与类型；差量函数没有生命周期或缓存状态。`findLanguageByName` 对 name/alias 做大小写归一，差量坐标采用 JS/CodeMirror 共用的 UTF-16 单位。未将 React 绑定销毁 view 的问题重复记到核心，也未将显式 JSON5 别名对应严格 JSON parser 的已说明限制记为新缺陷。

## 验证与边界

核对 [`review-document-change-properties.spec.ts`](../../../packages/code-editor/src/__tests__/review-document-change-properties.spec.ts)、[`language-resolution.spec.ts`](../../../packages/code-editor/src/__tests__/language-resolution.spec.ts) 与 [`accessibility.spec.ts`](../../../packages/code-editor/src/__tests__/accessibility.spec.ts) 的断言范围：差量可重构目标字符串，等价解析和空属性分别有用例。

本次 `code-editor:test`：107 passed (107)；目标实际执行。命令及整体边界见[总索引](README.md)。

边界：没有逐一下载和运行全部第三方语言 parser，也未执行浏览器可访问性验收。上游 parser 的语法能力不由别名元数据保证。
