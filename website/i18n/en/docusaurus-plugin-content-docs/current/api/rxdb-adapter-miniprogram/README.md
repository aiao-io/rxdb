# rxdb-adapter-miniprogram

Experimental single-connection RxDB adapter for WeChat / Douyin / Alipay mini programs. It reuses the repository, transaction, migration and change events of `rxdb-adapter-sqlite-core`,
loads the synchronous wa-sqlite build through the platform's WASM entry points (`WXWebAssembly` / `TTWebAssembly` / the Alipay logic layer's `WebAssembly`), and writes the database file into the platform user directory
(`wx.env.USER_DATA_PATH` / `tt.getEnvInfoSync().common.USER_DATA_PATH` / `my.env.USER_DATA_PATH`).

## Constraints

- Only the logic layers of WeChat, Douyin and Alipay mini programs are supported; this is not a generic "mini program" adapter. Douyin and Alipay are verified only on the developer tools and on iOS real devices,
  **Android real devices are not verified**; Alipay additionally relies on undocumented capabilities (see "Alipay"). Baidu and QQ are not supported.
- Only the synchronous `wa-sqlite.wasm`, a single JavaScript realm, and a single database connection are supported.
- The VFS uses a rollback journal; WAL, Worker, SharedWorker, and cross-page concurrent connections are explicitly unsupported.
- The VFS buffers the entire database file in memory; it is currently only suitable for compatibility verification within roughly 10 MB.
- The file APIs of all three platforms do not provide the reliable `fsync`, file locking and atomic rename semantics that SQLite needs, so this package makes no crash-recovery-safety promises.
- The in-memory buffer and the platform quota are two different things. The Douyin user directory is about 10 MB in total (at most 9 MiB per write measured on iOS); the database file, `-journal`
  and rollback headroom share it; when it fills up transactions fail with `SQLITE_FULL`, and committed data is still there after reopening (see "Host contract").

## Usage

Both the wa-sqlite Emscripten glue and the wasm binary come from
[`@subframe7536/sqlite-wasm`](https://www.npmjs.com/package/@subframe7536/sqlite-wasm),
which this package declares as an **exact-version** dependency: the glue is exposed only through `./dist/*` and the file names carry content hashes, so relaxing the pin with `^` would make
`loadSubframeModuleFactory()` point at files that do not exist.

Currently pinned to 1.3.1. The 1.4.0 glue changed `_sqlite3_version` to read a Global exported by the wasm, but `WXWebAssembly` on iOS WeChat
does not export Global, so initialization on a real device fails with `undefined is not an object`; the developer tools simulator uses standard WebAssembly and cannot catch it.
Before upgrading, run `src/__tests__/subframe-glue-exported-globals.spec.ts`: any code in the glue that reads an exported Global makes it fail.

The host app only needs to copy the wasm into the mini program code package; the glue is located by `loadSubframeModuleFactory()` itself:

```text
@subframe7536/sqlite-wasm/wasm  →  wa-sqlite/wa-sqlite.wasm inside the code package
```

The source subpath is exported as `SUBFRAME_WASM_SUBPATH`, and the target path inside the code package as `DEFAULT_WASM_PATH`.
The glue and the wasm are a pair; mixing them across builds results in a `LinkError`. Taro (Vite) projects do not need to hand-write build configuration — install
[`@aiao/rxdb-taro`](../rxdb-taro/README.md) (see [Bundler notes](#bundler-notes)).

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
    sync: `{ local: { adapter: adapterPackage.ADAPTER_NAME }, type: rxdbPackage.SyncType.None }`
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

You must await `/runtime`'s `prepareMiniProgramRuntime(wx)` before loading any RxDB, adapter main entry or
wa-sqlite glue. It prefetches a synchronous secure random pool through `wx.getRandomValues`, and fills in `structuredClone`,
`TextEncoder`, `TextDecoder` and `performance.now`.
If a trusted random source is missing, the random pool is exhausted, or a WeChat call fails, it throws immediately instead of degrading to non-cryptographic randomness.

The random pool defaults to `DEFAULT_MINI_PROGRAM_RANDOM_POOL_SIZE` (64 KiB); when the remaining amount drops to a quarter it automatically
refills the next pool in the background, so normal usage does not exhaust it; `randomPoolSize` can be raised up to `wx.getRandomValues`'s per-call
limit of 1 MiB. A single `crypto.getRandomValues` request larger than `randomPoolSize` throws a `RangeError` directly —
enlarge the pool. Bytes already handed out are erased from the pool immediately. A failed refill is retried on the next random request, and stops retrying after 3 consecutive failures;
if the remaining amount runs out before a refill succeeds, the thrown error carries WeChat's failure reason on `cause`.

`wx.getRandomValues` requires WeChat base library 2.15.0 or higher. The runtime must also natively provide `BigInt` and
`queueMicrotask`.
`checkMiniProgramRuntimeCapabilities()` can show the full capability matrix and the source of each capability before connecting.

## Douyin

Douyin has no convenience shape like `wechat`; the host is always injected via `createDouyinMiniProgramHost(tt, options)`. Taro projects can use
`taroMiniProgramRuntime()` from [`@aiao/rxdb-taro/runtime`](../rxdb-taro/README.md) directly to pick the WeChat or Douyin host and
WASM runtime according to the build platform; without Taro, write it like this:

```typescript
// Must live in non-strict-mode code (such as the entry file of the bundled output): inside a Douyin page module
// globalThis is undefined, and only `this` of a non-strict function is the real global object
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

  // Only the host and wasmRuntime change; wasmPath is omitted and host.defaultWasmPath is used
  database.adapter(
    adapterPackage.ADAPTER_NAME,
    db => new adapterPackage.RxDBAdapterWaSqliteMiniProgram(db, { moduleFactory, host, wasmRuntime: TTWebAssembly })
  );
  return database;
}
```

The Douyin host declares three fixed facts, all measured on the developer tools and iOS real devices:

- `fileLayout: { kind: 'chunked', chunkBytes: 65536 }`: when Douyin overwrites an existing file, the old file still counts against the quota until the write succeeds,
  and writing the whole file at once would cap the database at half the quota; once the quota is hit there is no room left even to roll back.
- `defaultWasmPath: '/wa-sqlite/wa-sqlite.wasm'`: Douyin resolves relative paths against the current page directory, so only an absolute path at the code package root
  loads from any page. The wasm is still copied to `wa-sqlite/wa-sqlite.wasm` at the code package root.
- The random source is `tt.getRandomValues`, with the same 1 MiB per-call limit, and the base library is counted from 2.87.0 (the version whose docs first state the parameter constraints).

`runtimeGlobal` only covers the adapter. Other code bundled into the same output still reads the free `globalThis`: the comlink that sqlite-core depends on
executes `'FinalizationRegistry' in globalThis` at module top level, so the chunk it lives in throws a TypeError as soon as it loads; RxDB core's leader election and
`BroadcastChannel` also read it. So the whole bundle must redirect `globalThis` to the real global object obtained at the entry during build time; once that is done the adapter
reads the real one through `globalThis`, and there is no need to pass `runtimeGlobal`. Taro (Vite) projects install [`@aiao/rxdb-taro`](../rxdb-taro/README.md),
which does this in Douyin builds (registers the real global object in `rxdb-realm.js` at the entry, and other chunks read it from there); other bundlers implement the same approach.
When neither can obtain the real global object, the bootstrap fails directly with "please inject via host.runtimeGlobal" instead of guessing.

iOS Douyin has no native `TextEncoder` / `TextDecoder`; the adapter's polyfills are only installed at `prepareMiniProgramHostRuntime`.
So code bundled into the output **must not construct encoders at module top level**; create them lazily on first use: measured on iOS real devices, a module-top-level `new TextEncoder()`
makes the page fail to load with `ReferenceError: Can't find variable: TextEncoder`, and after the real-device `require` swallows the error, a secondary
`... is not a function` shows up. `@aiao/rxdb`, `rxdb-adapter-sqlite-core`, `rxdb-adapter-encrypted`, `rxdb-plugin-storage`,
`rxdb-plugin-working-tree` have all been changed to create on first use, and each package's `module-load-without-encoding.spec.ts` guards every published entry;
business code bundled into the same output must follow the same rule.

## Alipay (experimental)

Alipay relies on four **undocumented** capabilities: the logic layer's standard `WebAssembly`, the logic layer's native `BigInt` (not on the simulator's global; recovered through the wasm i64-returning constructor), `crypto.getRandomValues` inside a Worker, and recovering the real global object.
Verified on the developer tools and iOS real devices (US-211 Alipay probe v7); **Android real devices are not verified**, and the quota has never been hit (`quota-unobserved`).
If the platform changes any undocumented behavior, the bootstrap throws `AlipayUndocumentedCapabilityError` directly, without degrading.

The code package must contain three things. Taro (Vite) projects should emit them with
`miniProgramVitePlugins('alipay', appRoot)` from [`@aiao/rxdb-taro/vite`](../rxdb-taro/README.md),
which also registers the real global object in the simulator. Other bundlers copy them manually per the table below;
the esbuild approach in the repo at [`apps/dev-rxdb-miniprogram-alipay-probe/scripts/build.mjs`](../_media/build.mjs)
is only a reference implementation and is not published with any package:

```text
@aiao/rxdb-adapter-miniprogram/alipay-random-worker.js  →  workers/index.js (precompiled ES5, copied as-is)
@subframe7536/sqlite-wasm/wasm                          →  wa-sqlite/wa-sqlite.wasm
the same wasm as base64 text                            →  wa-sqlite/wa-sqlite.wasm.base64.txt
```

`app.json` declares `"workers": ["workers/index.js"]`; `mini.project.json` sets
`"compileOptions": { "transpile": { "script": { "ignore": ["workers/**"] } } }`, otherwise the IDE swaps in a core-js the Worker cannot run. The text copy is for the developer tools simulator: it reads code package files as UTF-8 text, corrupting binaries; the wasm runtime
first reads `.wasm` and checks it against the pinned-version fingerprint, then falls back to the copy, and throws if neither matches.

The simulator's logic layer has no `BigInt`; it is filled in by `prepareMiniProgramHostRuntime`. So the RxDB stack (`@aiao/rxdb`, the adapter main entry, rxjs)
must stay in dynamically `import()`ed chunks that are evaluated only after bootstrap: in an es2018 bundle a module-top-level `BigInt("…")` throws as soon as it evaluates.
This bites when a bundler splits them into a common chunk that pages statically `require` based on reference counts — Taro's `manualChunks` does exactly that;
the Taro example uses [`config/lazy-chunk-vite-plugin.ts`](../_media/lazy-chunk-vite-plugin.ts) (ships with the demo, not published with the package) to merge modules reachable only through dynamic `import()` into a separate lazy chunk.

The developer tools' "real device debugging" does not use the native engine; it runs the logic layer on Boatman (a JavaScript interpreter written in JS). Its `var` hoisting ignores the inside of labeled statements (`label: {…}`):
such `var`s are only registered into the function scope when actually executed. In a call that never reaches them, assignments to the same name write into the enclosing closure. React 18's
reconciler hits exactly this (`beginWork` does `var o` inside `e:{…}`, writing `Symbol.for("react.element")` in the factory closure into the element object),
so the page throws React #31 when rendering. Preview, trial versions and the simulator all use the native engine and are unaffected. The Taro example uses [`config/labeled-var-hoist-vite-plugin.ts`](../_media/labeled-var-hoist-vite-plugin.ts) (ships with the demo, not published with the package)
to re-declare such `var`s at the top of the function when finalizing the bundle (ES semantics unchanged); other apps that must run in real device debugging need the same step.

Boatman has one more deviation: a member assignment `o.x = v` calls the setter and then calls the getter once more, using the getter's return value as the value of the assignment expression.
Relationship properties on entity classes must be written as `declare parent$: …`, not as `parent$!: …` fields: after being lowered to `this.parent$ = void 0`, construction passes through
the relationship accessor on the prototype, and Boatman then reads the getter while the entity status is not attached yet, throwing `Target has no entity status`. The system entities of `@aiao/rxdb`
have already been rewritten this way.

```typescript
async function createDatabase() {
  const runtime = await import('@aiao/rxdb-adapter-miniprogram/runtime');
  const randomWorker = my.createWorker('workers/index.js', { useExperimentalWorker: true });
  // Reading the free variable throws a ReferenceError when the logic layer has no WebAssembly; use typeof to test first
  const webAssembly = typeof WebAssembly === 'undefined' ? undefined : WebAssembly;
  const host = runtime.createAlipayMiniProgramHost(my, { randomWorker, webAssembly });
  // Checks WebAssembly, fills in BigInt and queueMicrotask, and obtains random numbers through the Worker
  await runtime.prepareMiniProgramHostRuntime(host);

  const [rxdbPackage, adapterPackage] = await Promise.all([
    import('@aiao/rxdb'),
    import('@aiao/rxdb-adapter-miniprogram')
  ]);
  const moduleFactory = await adapterPackage.loadSubframeModuleFactory();
  // When webAssembly is undefined the bootstrap above has already reported the missing logic-layer-webassembly, so we never get here
  const wasmRuntime = adapterPackage.createAlipayWasmRuntime(my, webAssembly!);
  const database = new rxdbPackage.RxDB({/* same as WeChat */});
  database.adapter(
    adapterPackage.ADAPTER_NAME,
    db => new adapterPackage.RxDBAdapterWaSqliteMiniProgram(db, { moduleFactory, host, wasmRuntime })
  );
  return database;
}
```

Fixed behaviors of the Alipay host:

- `fileLayout: { kind: 'chunked', chunkBytes: 65536 }`: only whole-file reads and writes are possible, with a 10 MiB per-file limit; writing the whole file at once would cap the database size at the per-file limit.
- When the synchronous FS fails it returns an error object instead of throwing: the host converts it into a thrown error, error codes 10022 / 10025 / 10028 are normalized to text the VFS recognizes, and the platform's original text is attached on `cause`.
- All reads and writes go through base64, and each user file is prefixed with a 1-byte frame header (the simulator rejects any empty write); so the on-disk format differs from other platforms — data directories were never shared across platforms anyway.
- When `runtimeGlobal` is not passed, the environment's `globalThis` is used if present (iOS real devices); otherwise (developer tools simulator) it is recovered through a temporarily defined getter on `Object.prototype`.

## Host contract

`wechat: wx` is a convenience shape for `host: createWechatMiniProgramHost(wx)`; pass exactly one of the two — passing both or neither
throws directly.
The corresponding config types are `WaSqliteMiniProgramOptions` (the WeChat shape; still an interface, so it can be `extends`ed) and
`WaSqliteMiniProgramHostOptions`; the adapter and the client accept the union `WaSqliteMiniProgramAdapterOptions` of the two.
The host's `requestRandomValues` must return a freshly allocated `Uint8Array` on every call, and must not read or write it after handing it over: the runtime uses it directly
as the random pool, hands out pieces and zeroes them in place; reusing a buffer that is still in use is detected as a contract violation and rejected. When the host lacks
`requestRandomValues`, the bootstrap fails directly. A config that passes `databaseRoot` no longer requires the host to provide a user data directory;
an empty-string directory is always treated as missing.
`MiniProgramHost` collects the platform-specific parts into one injection point: platform id, synchronous file system, user data directory,
secure random source, and the capability names used in errors. The runtime bootstrap corresponds to `prepareMiniProgramHostRuntime(host)`,
the file VFS to `createMiniProgramFileVFS(module, { host, databaseName })`,
and wasm loading to `loadWaSqliteMiniProgramModule(options, host)` (`host` is required; its `wasmRuntimeName` is used in errors).
All hosts share the same single-connection table; a second connection to the same database file is always rejected.

The host also has four optional fields; WeChat sets none of them, and the behavior is exactly the same as when unset; the Douyin host sets the first three (see "Douyin"), and the Alipay host sets `runtimeGlobal`, `fileLayout` and `prepareRuntime` (see "Alipay"):

| Field             | Default                        | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtimeGlobal`   | the environment's `globalThis` | The real global object that runtime patches write to and capability prechecks read from. When the environment's `globalThis` is unavailable (e.g. shadowed to `undefined` by page wrapper functions), the caller obtains it in non-strict code and injects it. If it is not the current realm's global object, the bootstrap fails with "please inject via host.runtimeGlobal" — no fallback, no guessing; the resolution logic is in `resolveMiniProgramRuntimeGlobal(host)`                                   |
| `fileLayout`      | `{ kind: 'single' }`           | `chunked` stores the logical file `P` as fixed-size chunks `P.0`, `P.1`…, and only rewrites dirty chunks on flush; each database additionally reserves 2×`chunkBytes` of rollback headroom (`<db>.rxdb-reserve`), which is yielded for rollback when the quota is hit; `MiniProgramFileVFS.reserveHeld` reports whether it is currently held. The two layouts are mutually incompatible; declaring `chunked` when the directory already contains a single-file database is rejected directly, without migration |
| `defaultWasmPath` | `DEFAULT_WASM_PATH`            | The in-package path loaded when `wasmPath` is not passed. Platforms that resolve relative paths against the current page directory must declare a code-package-root path starting with `/`                                                                                                                                                                                                                                                                                                                      |
| `prepareRuntime`  | not called                     | Called by `prepareMiniProgramHostRuntime` after the platform assertions and real-global-object resolution, before polyfills are installed, to let the platform fill in missing globals or detect dependencies; when it rejects, the bootstrap fails without requesting random numbers                                                                                                                                                                                                                           |

`getMiniProgramRuntimeSources(runtimeGlobal?)` reads sources by the same rules: if passed, it reads that one; otherwise the environment's `globalThis`.

When the user data directory fills up, transactions fail with `SQLITE_FULL` (13), and the platform's original text is passed through the `cause` chain:
`RxDBAdapterSqliteError` → SQLite error → VFS error → platform original error (`errMsg` / `message`).
After a single-file-layout database hits the quota, its state is treated per "no crash recovery".

The `structuredClone` polyfill references built-in constructors only through free variables and never reads `self` / `globalThis`,
so cloning typed arrays, wrapper objects and `Error` works even in page modules whose global object is shadowed; functions and symbols throw `TypeError`.

**The currently registered platforms are `wechat`, `douyin` and `alipay`** (`MINI_PROGRAM_PLATFORM_IDS`). Other platform ids fail before connecting, with no fallback to `wx`:
platforms judged `unsupported` by the feasibility matrix throw `MiniProgramUnsupportedPlatformError` (extending `MiniProgramUnknownPlatformError`),
and `blockers` plus the error text carry the blocking items and the judged section from the matrix — after Alipay was re-judged `supported` on 2026-10-04 this table is empty;
everything else throws `MiniProgramUnknownPlatformError`. The existence of this contract does not imply support for Baidu or QQ mini programs;
the feasibility conclusions for each platform are in
miniprogram-platform-feasibility.md.

## Bundler notes

The glue is ESM, and internally has `var _scriptName = import.meta.url` and
`new URL('wa-sqlite.wasm', import.meta.url)`. Both are troublesome: the mini program runtime has no `import.meta`,
and the latter is recognized by vite as an asset reference, inlining the ~0.7 MB wasm into the bundle as base64 (silently adding about 1 MB to the code package).

Both branches are unreachable when `locateFile` + `instantiateWasm` are passed explicitly, so the host build only needs to replace
`import.meta.url` in the glue with an empty string. In Taro (Vite) projects, add one line to `plugins` in `config/index.ts`:
[`'@aiao/rxdb-taro'`](../rxdb-taro/README.md) (WeChat, Douyin) — it does this step, ships the wasm into the code package, binds Douyin's real global object, and raises Taro's hard-coded `es6` build target to es2020
(vite 4 bundled with the Taro 4.3 template cannot rewrite RxDB's BigInt literals under es6);
other vite projects assemble their own setup with `miniProgramVitePlugins()` from `@aiao/rxdb-taro/vite`.

This package's own build keeps `@subframe7536/sqlite-wasm` external and does not bundle it into `dist` — for the same reason:
once bundled, the wasm would be inlined.

## FTS5

The `@subframe7536/sqlite-wasm` build enables `ENABLE_FTS5`, so the mini program side can create FTS5 virtual tables,
and `rxdb_fts_bigram` is registered together with the base class (Chinese needs it to split bigrams, otherwise a whole passage becomes a single token).
The integration test `src/__tests__/fts5.integration.spec.ts` covers Chinese and English MATCH with the real wasm + WeChat file VFS,
and verifies that the index survives disconnect and reconnect.

Two things are still not cleared: there is no measurement on real devices (WeChat base library), and `@aiao/rxdb-plugin-search`'s backend registry
still marks `wa-sqlite-miniprogram` as `unverified`.

When creating tables, a column name must not equal the table name — FTS5 declares the vtab with one extra column named after the table, so a collision duplicates the column, and it does not write
`*pzErr`, only reporting the opaque `vtable constructor failed: <table>`.

Mini program wa-sqlite adapter (WeChat, Douyin and Alipay, experimental).

Provides the full infrastructure needed to run RxDB in mini programs: WASM loading, synchronous file VFS,
runtime polyfills (TextEncoder/TextDecoder/structuredClone/crypto),
and synchronous callback hardening.

## Classes

| Class                                                                                 | Description                                                                                              |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [AlipayUndocumentedCapabilityError](classes/AlipayUndocumentedCapabilityError.md)     | Thrown at connect time when an undocumented capability the Alipay host depends on is unavailable.        |
| [MiniProgramUnknownPlatformError](classes/MiniProgramUnknownPlatformError.md)         | The passed platform id is not in [MINI\_PROGRAM\_PLATFORM\_IDS](variables/MINI_PROGRAM_PLATFORM_IDS.md). |
| [MiniProgramUnsupportedPlatformError](classes/MiniProgramUnsupportedPlatformError.md) | The passed platform id is judged `unsupported` by the feasibility matrix.                                |
| [RxDBAdapterWaSqliteMiniProgram](classes/RxDBAdapterWaSqliteMiniProgram.md)           | WeChat mini program single-connection wa-sqlite adapter.                                                 |
| [WaSqliteMiniProgramClient](classes/WaSqliteMiniProgramClient.md)                     | Mini-program-specific wa-sqlite client (host injected via `wechat` or `host`).                           |

## Interfaces

| Interface                                                                      | Description                                                                                                                   |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| [AlipayMiniProgramHostOptions](interfaces/AlipayMiniProgramHostOptions.md)     | Parameters of [createAlipayMiniProgramHost](functions/createAlipayMiniProgramHost.md).                                        |
| [AlipayRandomWorker](interfaces/AlipayRandomWorker.md)                         | The Worker returned by `my.createWorker('workers/index.js', { useExperimentalWorker: true })`; messages are plain objects.    |
| [AlipayStandardWasmApi](interfaces/AlipayStandardWasmApi.md)                   | The subset of the standard `WebAssembly` present in the logic layer.                                                          |
| [DouyinMiniProgramHostOptions](interfaces/DouyinMiniProgramHostOptions.md)     | Optional parameters of [createDouyinMiniProgramHost](functions/createDouyinMiniProgramHost.md).                               |
| [MiniProgramAlipayApi](interfaces/MiniProgramAlipayApi.md)                     | The members of the global `my` that the Alipay host needs.                                                                    |
| [MiniProgramAlipayRawFileSystem](interfaces/MiniProgramAlipayRawFileSystem.md) | The raw shape of the Alipay synchronous file system: every method returns a result object and does not throw on failure.      |
| [MiniProgramDouyinApi](interfaces/MiniProgramDouyinApi.md)                     | The Douyin runtime capabilities the adapter needs (the global `tt`).                                                          |
| [MiniProgramFileSystemManager](interfaces/MiniProgramFileSystemManager.md)     | The minimal contract of the WeChat mini program synchronous file system.                                                      |
| [MiniProgramFileVFS](interfaces/MiniProgramFileVFS.md)                         | Mini program synchronous file VFS handle.                                                                                     |
| [MiniProgramFileVFSOptions](interfaces/MiniProgramFileVFSOptions.md)           | Platform-agnostic mini program file VFS config.                                                                               |
| [MiniProgramHost](interfaces/MiniProgramHost.md)                               | Platform-agnostic mini program host: synchronous files, user data directory, secure random source and platform id.            |
| [MiniProgramHostCapabilityNames](interfaces/MiniProgramHostCapabilityNames.md) | The names host capabilities are shown under in prechecks and errors, with a platform prefix (e.g. `wx.getFileSystemManager`). |
| [MiniProgramRuntimeCapability](interfaces/MiniProgramRuntimeCapability.md)     | One capability required to run RxDB in a mini program.                                                                        |
| [MiniProgramWasmInstance](interfaces/MiniProgramWasmInstance.md)               | The minimal instance structure returned by `WXWebAssembly.instantiate`.                                                       |
| [MiniProgramWasmRuntime](interfaces/MiniProgramWasmRuntime.md)                 | The WASM runtime provided by the mini program platform (WeChat `WXWebAssembly`, Douyin `TTWebAssembly`).                      |
| [MiniProgramWechatApi](interfaces/MiniProgramWechatApi.md)                     | The WeChat runtime capabilities the adapter needs.                                                                            |
| [WaSqliteEmscriptenModule](interfaces/WaSqliteEmscriptenModule.md)             | The fields of the wa-sqlite Emscripten module used directly by the adapter and the VFS.                                       |
| [WaSqliteMiniProgramBaseOptions](interfaces/WaSqliteMiniProgramBaseOptions.md) | Adapter config independent of how the host is injected.                                                                       |
| [WaSqliteMiniProgramHostOptions](interfaces/WaSqliteMiniProgramHostOptions.md) | Adapter config that injects the host as a platform-agnostic [MiniProgramHost](interfaces/MiniProgramHost.md).                 |
| [WaSqliteMiniProgramOptions](interfaces/WaSqliteMiniProgramOptions.md)         | Config of the WeChat mini program wa-sqlite adapter (the WeChat convenience shape).                                           |
| [WaSqliteModuleFactoryOptions](interfaces/WaSqliteModuleFactoryOptions.md)     | Initialization parameters passed to the mini program wa-sqlite glue.                                                          |
| [WechatFileVFSOptions](interfaces/WechatFileVFSOptions.md)                     | WeChat file VFS config.                                                                                                       |

## Type Aliases

| Type Alias                                                                                           | Description                                                                                                                |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [AlipayUndocumentedCapability](type-aliases/AlipayUndocumentedCapability.md)                         | One undocumented capability the Alipay host depends on.                                                                    |
| [MiniProgramFileLayout](type-aliases/MiniProgramFileLayout.md)                                       | The storage layout of the database file on the host file system.                                                           |
| [MiniProgramHostSelection](type-aliases/MiniProgramHostSelection.md)                                 | How the host is injected: the WeChat convenience shape `wechat`, or the platform-agnostic `host` — exactly one of the two. |
| [MiniProgramPlatformId](type-aliases/MiniProgramPlatformId.md)                                       | The registered mini program platform ids.                                                                                  |
| [MiniProgramRuntimeCapabilityOptions](type-aliases/MiniProgramRuntimeCapabilityOptions.md)           | Config needed by the runtime precheck: module factory, WASM runtime, host, and an optional database directory.             |
| [MiniProgramRuntimeGlobal](type-aliases/MiniProgramRuntimeGlobal.md)                                 | The global object that runtime patches write to and capability prechecks read from.                                        |
| [MiniProgramWasmHost](type-aliases/MiniProgramWasmHost.md)                                           | The host fields used when loading wasm.                                                                                    |
| [ReceiveWasmInstance](type-aliases/ReceiveWasmInstance.md)                                           | The Emscripten custom instantiation callback.                                                                              |
| [WaSqliteMiniProgramAdapterOptions](type-aliases/WaSqliteMiniProgramAdapterOptions.md)               | The config accepted by the adapter and the client: either `wechat` or `host`.                                              |
| [WaSqliteMiniProgramRepositoryConstructor](type-aliases/WaSqliteMiniProgramRepositoryConstructor.md) | The replaceable repository constructor of the mini program adapter.                                                        |
| [WaSqliteModuleFactory](type-aliases/WaSqliteModuleFactory.md)                                       | The module factory exported by the wa-sqlite Emscripten glue, provided by `loadSubframeModuleFactory()`.                   |
| [WechatFileVFS](type-aliases/WechatFileVFS.md)                                                       | WeChat synchronous file VFS handle.                                                                                        |

## Variables

| Variable                                                                            | Description                                                                                                                                                      |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ADAPTER\_NAME](variables/ADAPTER_NAME.md)                                          | The adapter name.                                                                                                                                                |
| [ALIPAY\_UNDOCUMENTED\_CAPABILITIES](variables/ALIPAY_UNDOCUMENTED_CAPABILITIES.md) | The undocumented capabilities the Alipay host depends on, kept item-for-item consistent with alipay's `undocumented` in the matrix YAML (checked by unit tests). |
| [ALIPAY\_WASM\_TEXT\_COPY\_SUFFIX](variables/ALIPAY_WASM_TEXT_COPY_SUFFIX.md)       | The suffix of the base64 text copy of the wasm in the code package: the copy of `wa-sqlite/wa-sqlite.wasm` is `wa-sqlite/wa-sqlite.wasm.base64.txt`.             |
| [DEFAULT\_WASM\_PATH](variables/DEFAULT_WASM_PATH.md)                               | The default in-package wasm path.                                                                                                                                |
| [MINI\_PROGRAM\_PLATFORM\_IDS](variables/MINI_PROGRAM_PLATFORM_IDS.md)              | The registered mini program platform ids.                                                                                                                        |
| [SUBFRAME\_WASM\_SUBPATH](variables/SUBFRAME_WASM_SUBPATH.md)                       | The public subpath under which `@subframe7536/sqlite-wasm` exposes the wasm binary, for bundlers to copy into the code package.                                  |

## Functions

| Function                                                                                  | Description                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [assertMiniProgramPlatformId](functions/assertMiniProgramPlatformId.md)                   | Judges the platform id without needing a host: registered ones pass, unregistered ones throw directly. The host path ([resolveMiniProgramHost](functions/resolveMiniProgramHost.md), the runtime precheck, the VFS) uses the same judgment, so error messages match verbatim. |
| [assertMiniProgramRuntimeCapabilities](functions/assertMiniProgramRuntimeCapabilities.md) | Gives the full capability list before loading WASM when hard dependencies are missing.                                                                                                                                                                                        |
| [checkMiniProgramRuntimeCapabilities](functions/checkMiniProgramRuntimeCapabilities.md)   | Checks the capabilities required to run the full RxDB/wa-sqlite stack in a mini program logic layer.                                                                                                                                                                          |
| [createAlipayMiniProgramHost](functions/createAlipayMiniProgramHost.md)                   | Adapts the Alipay global `my` into a host.                                                                                                                                                                                                                                    |
| [createAlipayWasmRuntime](functions/createAlipayWasmRuntime.md)                           | The wasm runtime of the Alipay logic layer: fetches bytes via readAlipayCodePackageWasm and hands them to the standard `WebAssembly.instantiate`.                                                                                                                             |
| [createDouyinMiniProgramHost](functions/createDouyinMiniProgramHost.md)                   | Adapts the Douyin global `tt` into a [MiniProgramHost](interfaces/MiniProgramHost.md).                                                                                                                                                                                        |
| [createMiniProgramFileVFS](functions/createMiniProgramFileVFS.md)                         | Creates a single-connection, rollback-journal mini program synchronous file VFS.                                                                                                                                                                                              |
| [createWaSqliteMiniProgramClient](functions/createWaSqliteMiniProgramClient.md)           | Creates and initializes the mini-program-specific wa-sqlite client.                                                                                                                                                                                                           |
| [createWechatFileVFS](functions/createWechatFileVFS.md)                                   | Creates a single-connection, rollback-journal WeChat synchronous file VFS; the WeChat wrapper of `createMiniProgramFileVFS`.                                                                                                                                                  |
| [createWechatMiniProgramHost](functions/createWechatMiniProgramHost.md)                   | Adapts the WeChat global `wx` into a [MiniProgramHost](interfaces/MiniProgramHost.md).                                                                                                                                                                                        |
| [isMiniProgramPlatformId](functions/isMiniProgramPlatformId.md)                           | Checks whether a value is a registered platform id.                                                                                                                                                                                                                           |
| [loadSubframeModuleFactory](functions/loadSubframeModuleFactory.md)                       | Loads the synchronous wa-sqlite module factory of `@subframe7536/sqlite-wasm`.                                                                                                                                                                                                |
| [loadWaSqliteMiniProgramModule](functions/loadWaSqliteMiniProgramModule.md)               | Loads the synchronous wa-sqlite Emscripten module using the mini program WASM runtime.                                                                                                                                                                                        |
| [resolveMiniProgramHost](functions/resolveMiniProgramHost.md)                             | Resolves the single host from `{ wechat }` or `{ host }`, and validates the platform id.                                                                                                                                                                                      |
| [resolveMiniProgramRuntimeGlobal](functions/resolveMiniProgramRuntimeGlobal.md)           | Resolves the host's real global object: `host.runtimeGlobal` first, otherwise the environment's `globalThis`.                                                                                                                                                                 |

## References

### RxDBAdapterWaSqliteMiniprogram \{#rxdbadapterwasqliteminiprogram\}

Renames and re-exports [RxDBAdapterWaSqliteMiniProgram](classes/RxDBAdapterWaSqliteMiniProgram.md)

---

### WaSqliteMiniprogramOptions \{#wasqliteminiprogramoptions\}

Renames and re-exports [WaSqliteMiniProgramOptions](interfaces/WaSqliteMiniProgramOptions.md)
