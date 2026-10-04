---
id: RV-057
title: Angular/Vue 文件预览的迟到 Blob.text 覆盖新文件
status: Open
severity: P2
created: 2026-10-04
updated: 2026-10-04
baseline: 8b29b549ac5758b2e31a6148b98b8c394754e918
---

# RV-057：Angular/Vue 文件预览的迟到 Blob.text 覆盖新文件

## 问题

**P2，确认问题，待修复。** A 的 previewFile 已完成，组件正在等待 A 的 Blob.text。切换到 B，B 的预览先完成、标题与正文均为 B；A 的文本随后返回，Angular/Vue 正文被覆盖为 A，标题仍是 B。

这是文件身份错配，不是共享字符串 diff 算法或 CodeMirror 高亮造成。没有证明 OPFS 文件内容被写坏；本轮确认的是预览错误。React 的相同交错通过，不把三端一概归为失败。

## 根因

- [Angular loadFileContent](../../apps/dev-rxdb-angular/src/app/pages/opfs/components/opfs-file-preview.component.ts)：previewFile 后在 189 行检查路径，但 Blob.text（215–216）之后直接写 textContent，没有再次验证所有权。
- [Vue loadFileContent](../../apps/dev-rxdb-vue/src/pages/opfs/components/OpfsFilePreview.vue)：previewFile 后在 72 行附近检查 currentEntryPath；读取 Blob 文本后直接赋值（87 行附近），同样漏掉第二个异步段。
- [React 对照](../../apps/dev-rxdb-react/src/app/pages/opfs/components/OpfsFilePreview.tsx)：外层按 entry.path 重建子组件，文本 await 后再检查 active，旧任务不能写进新预览。

只在第一个 await 后检查路径，不覆盖整个异步链；字符串路径也不能区分同路径重新打开的纪元。

## 实际复验

[Angular spec](../../apps/dev-rxdb-angular/src/app/pages/opfs/components/review-preview-text-epoch.spec.ts)、[Vue spec](../../apps/dev-rxdb-vue/src/pages/opfs/components/review-preview-text-epoch.spec.ts)、[React 对照 spec](../../apps/dev-rxdb-react/src/app/pages/opfs/components/review-preview-text-epoch.spec.tsx) 执行原组件与框架生命周期。

实际 Blob 用 Promise 控制 text 返回时序，服务入口是明确接缝；通过“Blob.text 已开始”的 Promise 固定先后，不用睡眠碰运气。A/B 为文本预览，不把 CodeEditor 子组件 mock 成失败原因。

- Angular、Vue：交错各 **1 failed**，顺序对照各 **1 passed**。
- React：相同交错及顺序 **2 passed**。
- 合计 **2 failed /4 passed**：[最终日志](evidence/2026-10-04/editor-frameworks/final-preview-probes.txt) · [标题/正文观测](evidence/2026-10-04/editor-frameworks/final-observations.json)。React 取证的 act 警告已通过正确生命周期等待消除，没有禁用警告。

运行环境为 happy-dom，不是实际 OPFS 存储或浏览器权限/磁盘验证。服务被替换只用于控制时序，原 loadFileContent/watch/effect 与展示状态没有替换。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run-many -t test --projects=dev-rxdb-angular,dev-rxdb-react,dev-rxdb-vue --parallel=1 --args='review-preview-text-epoch --run --coverage.enabled=false --maxWorkers=1' --skipRemoteCache --skipNxCache
```

## 最小修复方向

为每次打开/关闭/切换分配预览纪元，每个异步阶段结束及写状态前确认当前纪元仍拥有结果；销毁/关闭使旧纪元失效。将检查覆盖到文本探测、Blob.text、URL 分配及 finally，不能只补第一个 await。

回归未知扩展探测、A→B→A、同路径重新打开、关闭/卸载、旧异常/finally 与 Blob URL 回收。本轮没有把这些尚未复验的场景都登记成已确认缺陷，也不以全局 URL revoke 掩盖资源归属。

## 解决记录

- [x] Angular/Vue 失败、顺序对照与 React 同序列对照保留。
- [ ] 统一预览纪元与提交守卫，补其它 await/销毁边界。
- [ ] 当前 Open，业务源码未改。
