---
package: rxdb-devtools
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# rxdb-devtools 增量代码评审

## 结论

🔴 待处理：1 条 P1、3 条 P2。上轮问题继续保留；本提交区间未提供关闭证据。本包实现源码未变，结论限于元数据/配置/文档增量及旧发现的变更核对；不代表依赖升级已完成行为回归。

## 提交与检查范围

- 上轮报告提交：`18ea576f`（2026-10-16，PR #128）；本轮检查到 `ffed57da`。逐包提交、全量增量统计与验证边界见 [本轮记录](./incremental-2026-10-26.md)。
- 本包变化：实现 0 文件、测试/测试工具 0 文件、配置/文档/版本 1 文件；以 Git 路径变化计，不把版本发布当成功能修复。
- 提交：`23d8a098 chore(aiao): release 0.0.28 (#153)`。
- 检查重点：核对版本/依赖声明、构建配置与说明文档；实现源码无增量，旧问题保留原证据。

## 发现

### P1：OPFS 文件上传静默覆盖同名文件，commit 失败留下截断的目标文件

- 证据：`src/browser/opfs-files-provider.ts:302-314` `commit()` 以 `getFileHandle(pending.name, { create: true })` + `createWritable()` 直接截断目标，`upload()` 与端点从不探测既有条目——同包 `create-directory`（`214-218`）对同名场景明确返回 `resource_conflict`，文件路径缺同一道闸。第二面：`output.write()/close()` 中途抛错（配额）时半写目标不被删除，`discard()/cleanup()` 只删临时文件，与模块头注释（`19-20` 行）承诺的「临时文件设计防止半写文件」相悖。
- 触发：devtools 面板上传与 OPFS 根目录既有条目同名的文件（重传同名、或与宿主应用自身 OPFS 数据撞名——根目录共享）→ 原文件被静默覆盖；配额不足时 commit 失败 → 目标处残留截断文件。
- 建议：上传登记期探测目标存在（返回 `resource_conflict`）；commit 失败时删除目标句柄。

### P2：`serializer` 过滤掉 undefined 数组元素导致索引错位；自有 `__proto__` 键被丢弃且输出对象原型被替换

- 证据：`src/serializer.ts:161、186-192`。
- 触发（已执行复现）：`serializeDevToolsValue([1, undefined, 3])` → `[1, 3]`——面板只读视图（`modules/rxdb-devtools-panel/src/components/devtools-value.component.ts`）把 3 显示在 `[1]`，patch/行数据错位；`serializeDevToolsValue(JSON.parse('{"__proto__":{...},"a":2}'))` → `{a:2}` 且原型被替换成用户对象（经 190 行的 `__proto__` setter 赋值），键从线缆上消失。现有 spec 只覆盖对象键里的 undefined，未覆盖数组。
- 建议：数组位保留占位（JSON `null` 或 wire 信封），键经 `Object.defineProperty`/空原型累加器写入。

### P2：v2 endpoint 出站传输登记被拒时，无条件释放会删掉对端存活的入站传输槽（并发上限绕过、tombstone 损坏）

- 证据：`src/v2/endpoint.ts:444-448` + `src/v2/session.ts:241-244`。connector 铸造可预测 id（`dl-${this.#ids.next()}`）；对端先以 `transferId: 'dl-2'` 发起入站 `TRANSFER_START`（session 接受），随后本端请求下载铸造 `dl-2` → `registerTransfer` 以 `transfer_duplicate` 拒绝（`session.ts:230-231` 不登记），`#beginDownload` 仍无条件 `releaseTransfer('dl-2')`（`447`），session 无条件删除 in-flight 条目（`243`）。入站传输继续运行但其槽位已释放（上限绕过），随后的 `settleTransfer` 找不到条目 → tombstone 永不记录。对照 `endpoint.ts:615` 对「登记成功却被表拒绝」的正确处理。
- 建议：仅当本端登记成功才释放，或让 `releaseTransfer` 要求匹配的登记。

### P2：v2 panel-endpoint 的 `params` 回调抛错时永久泄漏传输槽与 10 分钟计时器

- 证据：`src/v2/panel-endpoint.ts:388、393-408`。`request.params(transferId)` 在 `400` 行求值，位于负责清理的 `try/finally`（`404-408`）**之前**；异常以 rejection 逃逸（契约声明结果联合永不 reject），`388` 行写入的 `#transfers` 条目与 `393` 行的 `cancelTotal` 计时器不再清理——2 个在飞传输槽之一被烧到会话结束。`download()` 把 `request.params` 放在 try 内（约 `438-440`），两路径不对称。
- 建议：把 `params` 求值移进 try/finally。

## 验证与限制

本轮对本包执行静态增量检查，未单独运行其 lint/typecheck/test/build；不沿用旧报告的测试通过结论。

本轮环境为 Node `26.12.0`、pnpm `10.34.9`；旧报告的 Node 22 / Nx 插件加载限制已过时。未列出的任务与宿主验证不视为通过，统一边界见 [本轮记录](./incremental-2026-10-26.md#未覆盖)。
