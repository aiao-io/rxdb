# Review：@aiao/rxdb-devtools 评审

## 结论

🔴 二次评审对 57 个源文件做第二轮走读（含 v2 endpoint/session/transfer、serializer、buffer、sequence、mask、providers、native）后确认 1 条 P1 + 3 条 P2；首轮「未发现 P0-P2」结论被推翻。

## 检查范围

检查 connector/transport/providers/runtime、serializer、types、v2 endpoint/session/transfer、browser/native providers 和 testing suites；核对 exports、可选 vitest peer、Vite 构建入口与 README。二次评审对 serializer/buffer/sequence/mask/subscribe-once/events/entity-info/providers/testing-providers/v2/** 与 browser/native 文件上传路径逐文件走读，关键算法用构建产物执行复现。

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

### 已知弱项（未定级，均有具体触发，仅记录备查）

`getErrorMessage('')` 返回空串；`subscribeOnce` 对同步源未注册即 unregister；serializer 的 Error 分支丢 `RxDBError` 自身 code/constraint/entity/conflicts 字段；native-files-provider 上传映射永不淘汰；`CLEAR_EVENT_BUFFER` 无端点处理；协商状态机 DISCONNECT 后无法重新协商 v2；fake-providers 对 upload/download 参数校验比真实 provider 松，弱化共享 conformance 套件。

## 风险/未覆盖

未覆盖真实 Chrome extension/Tauri IPC、OPFS 权限和大文件传输压力；需在浏览器与宿主端跑协议/安全套件。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
