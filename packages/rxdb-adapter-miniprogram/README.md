# @aiao/rxdb-adapter-miniprogram

实验性的微信小程序单连接 RxDB adapter。它复用 `rxdb-adapter-sqlite-core` 的仓库、事务、迁移和变更事件，
用 `WXWebAssembly` 加载同步版 wa-sqlite，并把数据库文件写入 `wx.env.USER_DATA_PATH`。

## 约束

- 仅支持微信小程序逻辑层，不是通用“小程序”适配器。
- 只支持同步 `wa-sqlite.wasm`、单 JavaScript realm、单数据库连接。
- VFS 使用 rollback journal，明确不支持 WAL、Worker、SharedWorker、跨页面并发连接。
- VFS 会把整个数据库文件缓冲在内存中，当前只适合约 10 MB 内的兼容性验证。
- 微信文件 API 没有提供 SQLite 所需的可靠 `fsync`、文件锁和原子重命名语义，本包不承诺崩溃恢复安全。

## 使用

wa-sqlite 的 Emscripten glue 与 wasm 二进制都取自
[`@subframe7536/sqlite-wasm`](https://www.npmjs.com/package/@subframe7536/sqlite-wasm)，
本包把它列为**精确版本**依赖：glue 只经 `./dist/*` 暴露、文件名带内容哈希，用 `^` 放宽会让
`loadSubframeModuleFactory()` 指向不存在的文件。

宿主应用只需把 wasm 复制进小程序代码包，glue 由 `loadSubframeModuleFactory()` 自行定位：

```text
@subframe7536/sqlite-wasm/wasm  →  代码包内 wa-sqlite/wa-sqlite.wasm
```

源子路径导出为 `SUBFRAME_WASM_SUBPATH`，代码包内的目标路径导出为 `DEFAULT_WASM_PATH`。
glue 与 wasm 是一对，跨构建混用会 `LinkError`。

```typescript
async function createDatabase() {
  const runtime = await import('@aiao/rxdb-adapter-miniprogram/runtime');
  await runtime.prepareMiniProgramRuntime(wx);

  const [rxdbPackage, adapterPackage] = await Promise.all([
    import('@aiao/rxdb'),
    import('@aiao/rxdb-adapter-miniprogram')
  ]);
  const moduleFactory = await adapterPackage.loadSubframeModuleFactory();
  const database = new rxdbPackage.RxDB({
    dbName: 'todo',
    entities: [Todo],
    multiInstance: false,
    sync: { local: { adapter: adapterPackage.ADAPTER_NAME }, type: rxdbPackage.SyncType.None }
  });

  database.adapter(
    adapterPackage.ADAPTER_NAME,
    db =>
      new adapterPackage.RxDBAdapterWaSqliteMiniProgram(db, {
        moduleFactory,
        wasmPath: adapterPackage.DEFAULT_WASM_PATH,
        wasmRuntime: WXWebAssembly,
        wechat: wx
      })
  );
  return database;
}
```

必须先等待 `/runtime` 的 `prepareMiniProgramRuntime(wx)`，再加载任何 RxDB、adapter 主入口或
wa-sqlite glue。它会通过 `wx.getRandomValues` 预取同步安全随机池，并补齐 `structuredClone`、
`TextEncoder`、`TextDecoder` 和 `performance.now`。
缺少可信随机源、随机池耗尽或微信调用失败时会立即报错，不会降级为非加密随机数。

随机池默认 `DEFAULT_MINI_PROGRAM_RANDOM_POOL_SIZE`（64 KiB），剩余量跌到四分之一时会在后台
自动补给下一池，因此正常使用不会耗尽；`randomPoolSize` 可上调到 `wx.getRandomValues` 的单次
上限 1 MiB。已发出的字节会立刻从池里擦除。若补给期间微信侧持续失败且余量用尽，抛出的错误会把
微信的失败原因挂在 `cause` 上。

`wx.getRandomValues` 需要微信基础库 2.15.0 或更高版本。运行时还必须原生提供 `BigInt` 与
`queueMicrotask`。
`checkMiniProgramRuntimeCapabilities()` 可在连接前显示完整能力矩阵和能力来源。

## 打包器注意事项

glue 是 ESM，内部有 `var _scriptName = import.meta.url` 和
`new URL('wa-sqlite.wasm', import.meta.url)`。两处都有麻烦：小程序运行时没有 `import.meta`，
而后者会被 vite 识别成资产引用，把 727 KB 的 wasm 以 base64 内联进产物（代码包凭空多出约 1 MB）。

这两处分支在显式传 `locateFile` + `instantiateWasm` 时永远走不到，所以宿主构建把 glue 里的
`import.meta.url` 替换成空串即可。Taro 示例的 `subframeSqliteWasmVitePlugin()`
（见 [config/rxdb-packages-vite-plugin.ts](../../apps/dev-rxdb-miniprogram/config/rxdb-packages-vite-plugin.ts)）就做这件事，
copy 规则见同目录的 [config/index.ts](../../apps/dev-rxdb-miniprogram/config/index.ts)。

本包自身的构建把 `@subframe7536/sqlite-wasm` 保持在 external，不打进 `dist`——同理，
一旦打进来 wasm 就会被内联。

## FTS5

`@subframe7536/sqlite-wasm` 的构建开启了 `ENABLE_FTS5`，所以小程序侧可以建 FTS5 虚拟表，
`rxdb_fts_bigram` 也随基类一起注册（中文需要它切 bigram，否则整段只成一个 token）。
集成测试 `src/__tests__/fts5.integration.spec.ts` 用真实 wasm + 微信文件 VFS 覆盖了中英文 MATCH
与断开重连后索引仍在。

两点仍未放行：真机（微信基础库）上的表现尚无实测，`@aiao/rxdb-plugin-search` 的后端注册表也
仍把 `wa-sqlite-miniprogram` 标为 `unverified`。

建表时列名不能与表名相同——FTS5 声明 vtab 时会额外加一列与表同名，撞名即重复列，而它不写
`*pzErr`，只会报不透明的 `vtable constructor failed: <table>`。
