# Mini-program adapter (experimental)

`@aiao/rxdb-adapter-miniprogram` is an experimental **single-connection** RxDB adapter for WeChat / Douyin / Alipay mini-programs. It reuses
the repositories, transactions, migrations, and change events of `@aiao/rxdb-adapter-sqlite-core`, loads the synchronous wa-sqlite through the platform's WASM entry (`WXWebAssembly` /
`TTWebAssembly` / the Alipay logic layer's `WebAssembly`), and writes the database file into the platform user directory
(`wx.env.USER_DATA_PATH` / `tt.getEnvInfoSync().common.USER_DATA_PATH` / `my.env.USER_DATA_PATH`).

## Experimental boundaries

:::warning Confirm these limitations are acceptable before integrating

| dimension        | support                                                                                                                                                                                                                                                                                                                                                                                        |
| :--------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| platform         | the **WeChat**, **Douyin**, and **Alipay** mini-program logic layers — not a generic "mini-program" adapter; per-platform verdicts in the next section. Douyin and Alipay are only verified on devtools and real iOS devices, **not verified on real Android devices**; Alipay additionally relies on undocumented capabilities (see "Alipay"). Baidu and QQ are unsupported                   |
| concurrency      | synchronous `wa-sqlite.wasm` only, single JavaScript realm, **mandatory single connection**: a second connection to the same database file throws outright; concurrency safety is guaranteed by the JS layer, not SQLite locks                                                                                                                                                                 |
| journal mode     | `journal_mode = DELETE` (rollback journal); **no WAL**, no Worker, no SharedWorker, no cross-page concurrent connections                                                                                                                                                                                                                                                                       |
| crash recovery   | **no guarantees** — none of the three platforms' file APIs provide the reliable `fsync`, file locking, and atomic rename semantics SQLite requires                                                                                                                                                                                                                                             |
| data volume      | the VFS buffers the whole database file in memory; currently only suitable for compatibility verification within about 10 MB, not for large data                                                                                                                                                                                                                                               |
| quota            | counted separately from the memory buffer. The Douyin user directory totals about 10 MB (measured at most 9 MiB in a single write on iOS), shared by the database file, the `-journal`, and a 128 KiB rollback allowance per database; when full, transactions fail with `SQLITE_FULL` and the platform's original text is on the `cause` chain; committed data is still there after reopening |
| random source    | a 64 KiB random pool prefetched from `wx.getRandomValues` / `tt.getRandomValues` / the Alipay Worker's `crypto.getRandomValues`, replenished in the background as it runs low; when replenishment fails and the pool is exhausted it throws, **never degrading** to `Math.random` under any circumstances                                                                                      |
| full-text search | the wasm is built with FTS5 and you can write SQL virtual tables directly; but `@aiao/rxdb-plugin-search` has not allowlisted this adapter                                                                                                                                                                                                                                                     |

:::

## Platform support

| platform        | verdict      | reasons / boundaries                                                                                                                                                                                                                                                                                                                                                                                              |
| :-------------- | :----------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WeChat `wechat` | experimental | all boundaries in the table above apply                                                                                                                                                                                                                                                                                                                                                                           |
| Douyin `douyin` | experimental | all boundaries above apply; verified on devtools and real iOS devices, **not verified on real Android devices**                                                                                                                                                                                                                                                                                                   |
| Alipay `alipay` | experimental | all boundaries above apply; relies on four **undocumented** capabilities (the standard `WebAssembly` and `BigInt` in the logic layer, the `crypto` random source in Workers, recovering the real global object); bootstrap errors outright without degradation if the platform changes any of them; verified on devtools and real iOS devices, **not verified on real Android devices**, quota cap never observed |
| Baidu `baidu`   | unsupported  | no secure random source and no WASM entry found (undocumented, untested)                                                                                                                                                                                                                                                                                                                                          |
| QQ `qq`         | unsupported  | no secure random source and no WASM entry found (undocumented, untested)                                                                                                                                                                                                                                                                                                                                          |

See the feasibility matrix for how the platform is detected and the conditions for reconsideration.

## Installation

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-miniprogram
```

### wasm bundling

wa-sqlite's Emscripten glue and wasm binary both come from
[`@subframe7536/sqlite-wasm`](https://www.npmjs.com/package/@subframe7536/sqlite-wasm), which this package pins as an **exact-version** dependency
(currently locked at 1.3.1): the glue is only exposed via `./dist/*` with content-hashed file names, and relaxing to `^` would make `loadSubframeModuleFactory()` point at files that do not exist.

1.4.0's glue changed `_sqlite3_version` to read a Global exported from the wasm, but iOS WeChat's `WXWebAssembly` does not export Globals — real-device initialization fails immediately with
`undefined is not an object`; the devtools simulator uses standard WebAssembly, so it cannot catch this. Upgrading must pass the regression gate on glue-exported Globals.

The host app only needs to copy the wasm into the mini-program bundle; the glue locates itself via `loadSubframeModuleFactory()`:

```text
@subframe7536/sqlite-wasm/wasm  →  wa-sqlite/wa-sqlite.wasm inside the bundle
```

- The source subpath is exported as `SUBFRAME_WASM_SUBPATH`; the target path inside the bundle is exported as `DEFAULT_WASM_PATH`.
- The glue and the wasm are a pair; mixing across builds gives `LinkError`.
- Taro (Vite) projects do not hand-copy build config — install `@aiao/rxdb-taro`; see [Taro (mini-program)](/frameworks/taro.md).

## Runtime bootstrap and database creation

Before connecting you must wait for the `/runtime` bootstrap — WeChat uses `prepareMiniProgramRuntime(wx)`, Douyin uses
`prepareMiniProgramHostRuntime(createDouyinMiniProgramHost(tt, { runtimeGlobal }))`, Alipay uses
`prepareMiniProgramHostRuntime(createAlipayMiniProgramHost(my, { randomWorker, webAssembly }))`. The bootstrap prefetches a synchronous secure random pool through the platform's
`getRandomValues` and fills in `structuredClone`, `TextEncoder`, `TextDecoder`, and `performance.now`.
A missing trusted random source, an exhausted pool, or a failing platform call errors immediately — no degrading to non-cryptographic randomness. Do not load any RxDB,
adapter main entry, or wa-sqlite glue before the bootstrap completes.

- The random pool defaults to `DEFAULT_MINI_PROGRAM_RANDOM_POOL_SIZE` (64 KiB); when it drops to a quarter, the next pool is replenished in the background;
  `randomPoolSize` can be raised to `wx.getRandomValues`'s single-call cap of 1 MiB. A single `crypto.getRandomValues` request larger than
  `randomPoolSize` throws `RangeError` outright.
- `wx.getRandomValues` requires WeChat base library 2.15.0 or higher; the Douyin random source assumes base library 2.87.0+. The runtime must also natively provide
  `BigInt` and `queueMicrotask`.
- `checkMiniProgramRuntimeCapabilities()` shows the complete capability matrix and where each capability comes from before connecting.

### WeChat

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

`wechat: wx` is a convenience shape for `host: createWechatMiniProgramHost(wx)`; pass exactly one of the two — passing both or neither errors outright.

### Douyin

Douyin has no convenience shape like `wechat`; always inject the host via `createDouyinMiniProgramHost(tt, options)`. In Douyin page modules
`globalThis` is `undefined`, so you must recover the real global object from **non-strict-mode** code before injecting:

```typescript
// Must live in non-strict-mode code (e.g. the bundle's entry file): globalThis is undefined in Douyin page modules,
// and a non-strict function's this is the real global object
const runtimeGlobal = (function (this: unknown) {
  return this;
})() as MiniProgramRuntimeGlobal;

async function createDatabase() {
  const runtime = await import('@aiao/rxdb-adapter-miniprogram/runtime');
  const host = runtime.createDouyinMiniProgramHost(tt, { runtimeGlobal });
  await runtime.prepareMiniProgramHostRuntime(host);

  const [rxdbPackage, adapterPackage] = await Promise.all([
    import('@aiao/rxdb'),
    import('@aiao/rxdb-adapter-miniprogram')
  ]);
  const moduleFactory = await adapterPackage.loadSubframeModuleFactory();
  const database = new rxdbPackage.RxDB({/* same as WeChat */});

  // Only the host and wasmRuntime change; wasmPath is omitted and comes from host.defaultWasmPath
  database.adapter(
    adapterPackage.ADAPTER_NAME,
    db => new adapterPackage.RxDBAdapterWaSqliteMiniProgram(db, { moduleFactory, host, wasmRuntime: TTWebAssembly })
  );
  return database;
}
```

Three things are fixed by the Douyin host, all measured on devtools and real iOS devices:

- **64 KiB chunked storage**: when Douyin overwrites an existing file, the old file still counts against the quota until the write succeeds, so writing the whole file at once would cap the database at half the quota —
  and after hitting the quota there is no room left to roll back.
- **`defaultWasmPath: '/wa-sqlite/wa-sqlite.wasm'`**: Douyin resolves relative paths against the current page's directory; only an absolute path at the bundle root loads from any page. Copy the wasm to `wa-sqlite/wa-sqlite.wasm` at the bundle root as usual.
- **The random source goes through `tt.getRandomValues`**, with the same 1 MiB single-call cap.

iOS Douyin has no native `TextEncoder` / `TextDecoder`; the adapter's polyfills are only installed by `prepareMiniProgramHostRuntime`,
so the code shipped in the bundle **must not construct encoders at module top level** — wait until first use.

Taro projects can use the [Taro runtime entry](/frameworks/taro.md#runtime-entry) directly to pick the host and WASM runtime by build platform,
without writing their own `wx` / `tt` branches.

### Alipay

:::warning Relies on four undocumented capabilities; not verified on real Android devices

Alipay relies on four **undocumented** capabilities: the standard `WebAssembly` in the logic layer, native `BigInt` in the logic layer (absent from the simulator's global, recovered through the wasm
i64-returning constructor), `crypto.getRandomValues` in Workers, and recovering the real global object. Verified on devtools and real iOS devices;
**not verified on real Android devices**, and the quota was never hit. If the platform changes any undocumented behavior, bootstrap errors with `AlipayUndocumentedCapabilityError`,
no degradation.

:::

Three things must go into the bundle. Taro (Vite) projects prefer `miniProgramVitePlugins('alipay', appRoot)` from `@aiao/rxdb-taro/vite`
(see [Taro (mini-program)](/frameworks/taro.md#alipay-experimental)), which also handles real-global-object registration in the simulator; other bundlers copy by hand:

```text
@aiao/rxdb-adapter-miniprogram/alipay-random-worker.js  →  workers/index.js (precompiled ES5, copied as-is)
@subframe7536/sqlite-wasm/wasm                          →  wa-sqlite/wa-sqlite.wasm
the same wasm as base64 text                            →  wa-sqlite/wa-sqlite.wasm.base64.txt
```

- `app.json` declares `"workers": ["workers/index.js"]`; `mini.project.json` sets
  `"compileOptions": { "transpile": { "script": { "ignore": ["workers/**"] } } }`, otherwise the IDE swaps a non-working core-js into the Worker.
- The text copy is for the devtools simulator: it reads bundle files as UTF-8 text and rewrites binaries; the wasm runtime reads `.wasm` first against the locked version's fingerprint,
  falls back to the copy on mismatch, and errors if neither matches.
- The simulator's logic layer has no `BigInt`; it must wait for `prepareMiniProgramHostRuntime` to fill it in. The RxDB stack (`@aiao/rxdb`, the adapter main entry, rxjs)
  must therefore stay in dynamic `import()` chunks evaluated only after bootstrap; bundlers merging them into a common chunk statically `require`d by pages break this
  (Taro's `manualChunks` is exactly that; the lazy-split plugin handles it).
- The devtools' "real device debugging" runs the logic layer through Boatman (a JS interpreter written in JS), which deviates in two places: `var` inside a labeled statement
  (`label: {…}`) is not hoisted (React 18's reconciler steps on exactly this, page rendering throws React #31), requiring a build-time declaration fix; and member assignment `o.x = v` reads the getter once more after calling the setter — relation properties in entity classes must be written `declare parent$: …`, not `parent$!: …` fields. Preview, trial builds, and
  the simulator all use the native engine and are unaffected.

```typescript
async function createDatabase() {
  const runtime = await import('@aiao/rxdb-adapter-miniprogram/runtime');
  const randomWorker = my.createWorker('workers/index.js', { useExperimentalWorker: true });
  // Reading a free variable throws ReferenceError when the logic layer has no WebAssembly; check with typeof first
  const webAssembly = typeof WebAssembly === 'undefined' ? undefined : WebAssembly;
  const host = runtime.createAlipayMiniProgramHost(my, { randomWorker, webAssembly });
  // Checks WebAssembly, fills in BigInt and queueMicrotask, fetches random numbers through the Worker
  await runtime.prepareMiniProgramHostRuntime(host);

  const [rxdbPackage, adapterPackage] = await Promise.all([
    import('@aiao/rxdb'),
    import('@aiao/rxdb-adapter-miniprogram')
  ]);
  const moduleFactory = await adapterPackage.loadSubframeModuleFactory();
  // When webAssembly is undefined, the bootstrap above already reported the missing logic-layer-webassembly; execution never gets here
  const wasmRuntime = adapterPackage.createAlipayWasmRuntime(my, webAssembly!);
  const database = new rxdbPackage.RxDB({/* same as WeChat */});
  database.adapter(
    adapterPackage.ADAPTER_NAME,
    db => new adapterPackage.RxDBAdapterWaSqliteMiniProgram(db, { moduleFactory, host, wasmRuntime })
  );
  return database;
}
```

## Bundler notes

The glue is ESM with `var _scriptName = import.meta.url` and `new URL('wa-sqlite.wasm', import.meta.url)` inside. Both are trouble:
mini-program runtimes have no `import.meta`, and the latter is recognized by vite as an asset reference, inlining the ~0.7 MB wasm as base64 into the output
(the bundle gains about 1 MB for nothing). Both branches are unreachable when `locateFile` + `instantiateWasm` are passed explicitly, so the host build replaces
`import.meta.url` in the glue with an empty string.

Taro (Vite) projects add one line `'@aiao/rxdb-taro'` to `plugins` in `config/index.ts` (WeChat, Douyin): this step, shipping the wasm into
the bundle, binding Douyin's real global object, and raising Taro's hardcoded `es6` build target to es2020 are all handled by it; other vite projects assemble their own with
`miniProgramVitePlugins()` from `@aiao/rxdb-taro/vite`. See [Taro (mini-program)](/frameworks/taro.md) for details.

## Full-text search and FTS5

- `@subframe7536/sqlite-wasm`'s build enables `ENABLE_FTS5`, so the mini-program side can create FTS5 virtual tables, and `rxdb_fts_bigram` is registered with the base class
  (Chinese needs it for bigram tokenization; otherwise a whole passage becomes a single token).
- But `@aiao/rxdb-plugin-search`'s backend registry still marks `wa-sqlite-miniprogram` as `unverified`: registering the search plugin on this adapter throws
  `SearchUnsupportedAdapterError` fail-fast. See the [plugin docs](/plugins/rxdb-plugin-search/README.md) for the allowlist and status.
- FTS5 behavior on real devices (WeChat base library) has no measurements yet.
- Column names must not equal the table name in CREATE TABLE — FTS5 adds an extra column with the same name as the table when declaring the vtab; a collision is a duplicate column and only surfaces as the opaque
  `vtable constructor failed: <table>`.

## Related docs

- [Taro (mini-program)](/frameworks/taro.md)
- [Database adapters](/adapters/README.md)
- [Version compatibility matrix](/compatibility.md)
