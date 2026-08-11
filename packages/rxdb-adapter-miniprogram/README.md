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

把包内两个静态资产放进小程序代码包：

```text
@aiao/rxdb-adapter-miniprogram/assets/wa-sqlite.cjs
@aiao/rxdb-adapter-miniprogram/assets/wa-sqlite.wasm
```

Taro 示例把 wasm 复制到 `dist/wa-sqlite/wa-sqlite.wasm`，glue 由构建器作为 CommonJS 模块打包。

```typescript
import type { WaSqliteModuleFactory } from '@aiao/rxdb-adapter-miniprogram';

async function createDatabase() {
  const runtime = await import('@aiao/rxdb-adapter-miniprogram/runtime');
  await runtime.prepareMiniProgramRuntime(wx);

  const [rxdbPackage, adapterPackage, glueModule] = await Promise.all([
    import('@aiao/rxdb'),
    import('@aiao/rxdb-adapter-miniprogram'),
    import('@aiao/rxdb-adapter-miniprogram/assets/wa-sqlite.cjs')
  ]);
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
        moduleFactory: glueModule.default as WaSqliteModuleFactory,
        wasmPath: 'wa-sqlite/wa-sqlite.wasm',
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

`wx.getRandomValues` 需要微信基础库 2.15.0 或更高版本。运行时还必须原生提供 `BigInt` 与
`queueMicrotask`。
`checkMiniProgramRuntimeCapabilities()` 可在连接前显示完整能力矩阵和能力来源。
