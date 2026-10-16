# Review：@aiao/code-editor 评审

## 结论

🟢 本轮未发现 P0-P2 行为问题。核心纯函数与语言目录实现边界清晰，三端共用的差量同步、语言解析、无障碍属性和错误载荷均有对应单测。

## 检查范围

检查 `src/accessibility.ts`、`document-sync.ts`、`language-resolution.ts`、`language-error.ts`、`languages.ts`、`index.ts`，以及 `src/__tests__`；核对 `package.json` 的 exports、依赖和 `project.json` 的 typecheck 目标；阅读 README 的自定义语言和 JSON5 说明。

## 发现

无。`computeMinimalDocumentChange` 对相同值、前后缀差量和空串有测试；`resolveCodeEditorLanguage` 区分 none/not-found/found；`overrideLanguage` 合并上游 alias/extensions/filename，避免覆盖上游匹配元数据。

## 风险/未覆盖

未覆盖真实 CodeMirror 浏览器 DOM、动态 chunk 网络失败和 ShadowRoot 宿主；这些由 Angular/React/Vue 绑定包的宿主测试承担。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
