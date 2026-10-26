---
package: rxdb-adapter-miniprogram
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# rxdb-adapter-miniprogram 增量代码评审

## 结论

🟡 待处理：2 条 P3。上轮问题继续保留；本提交区间未提供关闭证据。

## 提交与检查范围

- 上轮报告提交：`18ea576f`（2026-10-16，PR #128）；本轮检查到 `ffed57da`。逐包提交、全量增量统计与验证边界见 [本轮记录](./incremental-2026-10-26.md)。
- 本包变化：实现 5 文件、测试/测试工具 3 文件、配置/文档/版本 3 文件；以 Git 路径变化计，不把版本发布当成功能修复。
- 提交：`07d74e55 fix(miniprogram): patch sqlite-wasm 1.4.0 global fallback`；`e75284f0 fix(deps): address dependency review findings`；`c425f414 chore(deps): safely upgrade workspace dependencies`；`b109ba33 feat(aiao): 重构 worktree 功能 (#122)`；`23d8a098 chore(aiao): release 0.0.28 (#153)`；`4e544ee5 fix(aiao): 小程序 VFS 追加写按余量扩容，不再每页整库重拷（US-209） (#146)`。
- 检查重点：US-209 VFS 追加写余量扩容与截断不变量；sqlite-wasm 1.4.0 glue 入口、支付宝 WASM 指纹与全局对象补丁。旧 UTF-8 与 Factory 登记回收代码未修。
- 实现锚点：`src/create-client.ts`、`src/hosts/alipay-wasm.ts`、`src/subframe-glue.ts`、`src/subframe-sqlite-wasm.d.ts`、`src/wechat-file-vfs.ts`。

## 发现

### P3：UTF-8 解码 polyfill 把整段无效多字节序列折成 1 个替换字符，与 WHATWG TextDecoder 逐字节语义不符

- 证据：`src/text-encoding-polyfills.ts:113-120` `invalidSequenceWidth` 返回「引导字节 + 全部后续续字节」，调用处（`206-207`）据此只发 1 个 U+FFFD；WHATWG 语义是每字节一个错误、每字节一个 U+FFFD。已与原生 `TextDecoder` 实测对照：`decode([0xE0, 0x80, 0x80])` 原生发 3 个替换字符，polyfill 发 1 个（过长短 3 字节序列 `0xE0 0x80..0x9F`、代理区 `0xED 0xA0..0xBF`、越界 `0xF4 0x90..` 均中招）。
- 影响：小程序端解码含此类字节的文本（外部写入的损坏/越界数据）时替换字符计数与标准不一致，下游按字符长度/索引对齐的逻辑（如高亮、截断）可能错位。
- 建议：无效序列返回宽度 1（只推进引导字节），让每个续字节各自产生 U+FFFD。

### P3：`Factory(module)` 抛错时活动库登记不回收，同库重连持续误报「不支持同一数据库的并发连接」

- 证据：`src/create-client.ts:67` 的 `Factory(module)` 在 try 之外——`createMiniProgramFileVFS`（`wechat-file-vfs.ts:623`）已把 dbName 登记进 `ACTIVE_DATABASES`，而清理 try/catch 只包住 `vfs_register`（`66` 行）。用户提供的 `moduleFactory` 缺 glue 导出时 wa-sqlite 的 Factory 立即读 `Module._getSqliteFree()`/`_malloc` 抛 TypeError（node_modules/wa-sqlite/src/sqlite-api.js:27-33）。
- 触发：`moduleFactory` 返回缺导出模块 → 抛出；随后同一 dbName 的每次 `createWaSqliteMiniProgramClient` 都失败并报误导性错误「不支持同一数据库的并发连接」，直到页面重载。
- 建议：try/catch 覆盖 `Factory(module)` / `attachVfsErrorCauses`，catch 里 `vfsHandle.vfs.close()` 回收登记。

## 验证与限制

本轮 Node 模式全量 **29 文件 / 357 例通过**，含 VFS 余量扩容与 1.4.0 glue/WASM 指纹相关测试。未运行小程序真机。

本轮环境为 Node `26.12.0`、pnpm `10.34.9`；旧报告的 Node 22 / Nx 插件加载限制已过时。未列出的任务与宿主验证不视为通过，统一边界见 [本轮记录](./incremental-2026-10-26.md#未覆盖)。
