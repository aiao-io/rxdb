---
id: RV-056
title: 三端编辑器漏处理同步语言加载异常，Vue 跳过只读初始化
status: Open
severity: P2
created: 2026-10-04
updated: 2026-10-04
baseline: 8b29b549ac5758b2e31a6148b98b8c394754e918
---

# RV-056：三端编辑器漏处理同步语言加载异常，Vue 跳过只读初始化

## 问题

**P2，确认问题，待修复。** 一个类型合法的自定义 CodeMirror `LanguageDescription.of({ load })`，其语言工厂在返回 Promise 前抛错，三个封装都未将它送入公开的语言错误通道。

- Angular：错误逃出组件初始化，`aoLanguageError` 没有收到错误。
- React：错误逃出 effect，实际编辑器被卸载，`onLanguageError` 没有收到错误。
- Vue：真实 `createApp` 的 errorHandler 收到异常，但 `language-error` 没有上报；`readonly=true / disabled=true` 的编辑区仍为 `readOnly=false`、`contenteditable=true`。

这是扩展语言配置的失败处理问题，不把默认 SQL/JS 的正常异步 import 全部宣称为故障。Vue 的只读配置不是权限边界，本报告不宣称安全隔离绕过。

## 根因

[Angular setLanguage](../../packages/code-editor-angular/src/code-editor.ts)（488–498）、[React language effect](../../packages/code-editor-react/src/CodeEditor.tsx)（482–495）、[Vue updateLanguage](../../packages/code-editor-vue/src/CodeEditor.vue)（227–238）都直接调用 `description.load().then(success, failure)`。第二个 handler 只接 Promise rejection，接不到调用 `load()` 本身的同步 throw。

当前真实 `@codemirror/language 6.12.4` 的 `LanguageDescription.load()` 会直接调用工厂后再接 then。返回类型是 Promise，不保证工厂在创建 Promise 前不抛异常。

Vue 的 mounted 顺序是 `updateTheme → updateLanguage → updateReadonly/placeholder/indent/a11y`（124–132）；语言异常中断了后续访问状态初始化。这解释了为何不只是漏一条错误事件。

## 实际复验

三个 spec 都使用**原组件、原框架运行时和真实 CodeMirror LanguageDescription/State/View**；只控制自定义语言工厂。不是把 `load` 方法或 EditorView 换成假类。

- [Angular spec](../../packages/code-editor-angular/src/__tests__/review-language-sync-throw.spec.ts)：真实 TestBed。
- [React spec](../../packages/code-editor-react/src/__tests__/review-language-sync-throw.spec.tsx)：真实 React render/effect/cleanup。
- [Vue spec](../../packages/code-editor-vue/src/__tests__/review-language-sync-throw.spec.ts)：真实 createApp/errorHandler/mount/unmount；不用测试工具的额外 mount-error 重抛替代生产 Vue 行为。

每端 **1 failed /1 passed**，合计 **3 failed /3 passed**。对照组只将相同错误改成 Promise rejection，错误事件正常且编辑器/访问状态保持正确。[最终日志](evidence/2026-10-04/editor-frameworks/final-four-package-tests.txt) · [观测](evidence/2026-10-04/editor-frameworks/final-observations.json)。运行面为 happy-dom，未验收真实浏览器输入、IME 或辅助技术。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run-many -t test --projects=code-editor-angular,code-editor-react,code-editor-vue --parallel=1 --args='review-language-sync-throw --run --coverage.enabled=false --maxWorkers=1' --skipRemoteCache --skipNxCache
```

## 最小修复方向

在共同加载边界将调用本身纳入 Promise/错误结算协议，同步 throw 与 rejection 统一送入原语言错误通道；保留 request/view 代次守卫。访问状态初始化不能被语言加载失败阻断。

回归三端同步 throw、rejection、未知语言、正常语言、过期失败、卸载后结算，以及 Vue readonly/disabled/a11y。不要捕获宿主错误回调自身的异常来伪装加载成功，不将整件事扩大为编辑器重写。

## 解决记录

- [x] 三端失败复验、同错误 rejection 对照和真实 Vue 访问状态观测保留。
- [ ] 统一语言加载调用/结算边界，补三端回归。
- [ ] 当前 Open，业务源码未改。
