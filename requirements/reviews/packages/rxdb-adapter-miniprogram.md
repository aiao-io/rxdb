# Review：rxdb-adapter-miniprogram

## 结论

🟡 二次评审发现 2 条 P3：UTF-8 解码 polyfill 对无效序列的替换字符个数与 WHATWG 标准不符；`Factory` 抛错时活动库登记不回收，同库重连被误判为并发连接。

## 检查范围

检查了 `package.json` 的 runtime/worker exports、`project.json` 的平台可行性矩阵 inputs、README 的微信/抖音/支付宝能力边界；走读 `src/create-client.ts`、`loader.ts`、`host.ts`、`runtime-capabilities.ts`、`runtime-polyfills.ts`、`wechat-file-vfs.ts`、支付宝/抖音 host、WASM loader、statement cleanup、同步回调与随机池实现，以及 `src/__tests__/**` 的平台、配额、分块布局、WASM、polyfill 和集成测试。二次评审额外核对了 VFS 分块/填充/页数学、配额分类、随机池轮换与 text-encoding polyfill 的 WHATWG 符合性。

## 发现

### P3：UTF-8 解码 polyfill 把整段无效多字节序列折成 1 个替换字符，与 WHATWG TextDecoder 逐字节语义不符

- 证据：`src/text-encoding-polyfills.ts:113-120` `invalidSequenceWidth` 返回「引导字节 + 全部后续续字节」，调用处（`206-207`）据此只发 1 个 U+FFFD；WHATWG 语义是每字节一个错误、每字节一个 U+FFFD。已与原生 `TextDecoder` 实测对照：`decode([0xE0, 0x80, 0x80])` 原生发 3 个替换字符，polyfill 发 1 个（过长短 3 字节序列 `0xE0 0x80..0x9F`、代理区 `0xED 0xA0..0xBF`、越界 `0xF4 0x90..` 均中招）。
- 影响：小程序端解码含此类字节的文本（外部写入的损坏/越界数据）时替换字符计数与标准不一致，下游按字符长度/索引对齐的逻辑（如高亮、截断）可能错位。
- 建议：无效序列返回宽度 1（只推进引导字节），让每个续字节各自产生 U+FFFD。

### P3：`Factory(module)` 抛错时活动库登记不回收，同库重连持续误报「不支持同一数据库的并发连接」

- 证据：`src/create-client.ts:65` 的 `Factory(module)` 在 try 之外——`createMiniProgramFileVFS`（`wechat-file-vfs.ts:623`）已把 dbName 登记进 `ACTIVE_DATABASES`，而清理 try/catch 只包住 `vfs_register`（`66` 行）。用户提供的 `moduleFactory` 缺 glue 导出时 wa-sqlite 的 Factory 立即读 `Module._getSqliteFree()`/`_malloc` 抛 TypeError（node_modules/wa-sqlite/src/sqlite-api.js:27-33）。
- 触发：`moduleFactory` 返回缺导出模块 → 抛出；随后同一 dbName 的每次 `createWaSqliteMiniProgramClient` 都失败并报误导性错误「不支持同一数据库的并发连接」，直到页面重载。
- 建议：try/catch 覆盖 `Factory(module)` / `attachVfsErrorCauses`，catch 里 `vfsHandle.vfs.close()` 回收登记。

## 风险/未覆盖

真实微信、抖音、支付宝开发者工具和真机行为依赖外部 SDK；当前 Node 测试不能替代真机配额、Worker 和全局对象语义验证。

## 建议验证

执行 `pnpm nx run rxdb-adapter-miniprogram:typecheck`、`pnpm nx test rxdb-adapter-miniprogram`，并按 `requirements/stories/adapter/miniprogram-platform-feasibility.md` 在微信/抖音真机复验持久化、升级和磁盘满路径。
