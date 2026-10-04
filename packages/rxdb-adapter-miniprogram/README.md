# @aiao/rxdb-adapter-miniprogram

实验性的微信 / 抖音 / 支付宝小程序单连接 RxDB adapter。它复用 `rxdb-adapter-sqlite-core` 的仓库、事务、迁移和变更事件，
用平台的 WASM 入口（`WXWebAssembly` / `TTWebAssembly` / 支付宝逻辑层的 `WebAssembly`）加载同步版 wa-sqlite，并把数据库文件写入平台用户目录
（`wx.env.USER_DATA_PATH` / `tt.getEnvInfoSync().common.USER_DATA_PATH` / `my.env.USER_DATA_PATH`）。

## 约束

- 只支持微信、抖音与支付宝小程序的逻辑层，不是通用“小程序”适配器。抖音与支付宝都只在开发者工具与 iOS 真机上验证过，
  **Android 真机未验证**；支付宝还依赖未文档化能力（见「支付宝」）。百度、QQ 不支持。
- 只支持同步 `wa-sqlite.wasm`、单 JavaScript realm、单数据库连接。
- VFS 使用 rollback journal，明确不支持 WAL、Worker、SharedWorker、跨页面并发连接。
- VFS 会把整个数据库文件缓冲在内存中，当前只适合约 10 MB 内的兼容性验证。
- 三个平台的文件 API 都没有提供 SQLite 所需的可靠 `fsync`、文件锁和原子重命名语义，本包不承诺崩溃恢复安全。
- 内存缓冲与平台配额是两回事。抖音用户目录总共约 10 MB（iOS 实测一次最多写入 9 MiB），库文件、`-journal`
  与回滚余量共用；写满时事务以 `SQLITE_FULL` 失败，已提交的数据重开仍在（见「宿主契约」）。

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
上限 1 MiB。单次 `crypto.getRandomValues` 请求超过 `randomPoolSize` 时直接抛 `RangeError`，
需要调大池子。已发出的字节会立刻从池里擦除。补给失败会在下一次取随机数时重试，连续失败 3 次后
不再重试；若余量用尽时补给仍未成功，抛出的错误会把微信的失败原因挂在 `cause` 上。

`wx.getRandomValues` 需要微信基础库 2.15.0 或更高版本。运行时还必须原生提供 `BigInt` 与
`queueMicrotask`。
`checkMiniProgramRuntimeCapabilities()` 可在连接前显示完整能力矩阵和能力来源。

## 抖音

抖音没有 `wechat` 那样的便利形状，一律经 `createDouyinMiniProgramHost(tt, options)` 注入 host：

```typescript
// 必须写在非严格模式的代码里（如打包产物的入口文件）：抖音页面模块里 globalThis 是 undefined，
// 非严格函数的 this 才是真实全局对象
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
  const database = new rxdbPackage.RxDB({/* 同微信 */});

  // 只换 host 与 wasmRuntime；wasmPath 不传，走 host.defaultWasmPath
  database.adapter(
    adapterPackage.ADAPTER_NAME,
    db => new adapterPackage.RxDBAdapterWaSqliteMiniProgram(db, { moduleFactory, host, wasmRuntime: TTWebAssembly })
  );
  return database;
}
```

抖音 host 固定声明三件事，都来自开发者工具与 iOS 真机实测：

- `fileLayout: { kind: 'chunked', chunkBytes: 65536 }`：抖音覆盖写已有文件时，旧文件在写成功前仍计入配额，
  整文件落盘会让库上限只剩配额的一半，撞配额后回滚也没空间。
- `defaultWasmPath: '/wa-sqlite/wa-sqlite.wasm'`：抖音按当前页面目录解析相对路径，只有代码包根的绝对路径
  在任意页面都能加载。wasm 照样复制到代码包根的 `wa-sqlite/wa-sqlite.wasm`。
- 随机源走 `tt.getRandomValues`，单次上限同样是 1 MiB，基础库按 2.87.0 起算（该版起文档才写明参数约束）。

`runtimeGlobal` 只管得到 adapter。打进同一份产物的其他代码照样读自由的 `globalThis`：sqlite-core 依赖的 comlink
在模块顶层执行 `'FinalizationRegistry' in globalThis`，所在 chunk 一加载就抛 TypeError；RxDB 核心的选主与
`BroadcastChannel` 也读它。所以整份产物要在构建期把 `globalThis` 改指入口取到的真实全局对象，做到这一步后 adapter
读到的 `globalThis` 就是它，不必再传 `runtimeGlobal`。Taro（Vite）的做法见 `apps/dev-rxdb-miniprogram` 的
`config/realm-vite-plugin.ts`（`realmVitePlugin`，抖音与支付宝共用）与 `build-tt` / `build-alipay` target。两者都拿不到真实全局对象时引导直接报
「请经 host.runtimeGlobal 注入」，不会猜。

iOS 抖音没有原生 `TextEncoder` / `TextDecoder`，adapter 的 polyfill 要到 `prepareMiniProgramHostRuntime` 才装。
所以打进产物的代码**不能在模块顶层构造编码器**，要等第一次用到再建：iOS 真机实测，模块顶层的 `new TextEncoder()`
让页面加载即报 `ReferenceError: Can't find variable: TextEncoder`，真机 `require` 吞掉错误后还会冒出次生的
`... is not a function`。`@aiao/rxdb`、`rxdb-adapter-sqlite-core`、`rxdb-adapter-encrypted`、`rxdb-plugin-storage`、
`rxdb-plugin-working-tree` 已经全部改成首次使用时创建，各包的 `module-load-without-encoding.spec.ts` 把住每个发布入口；
业务代码打进同一份产物时守同一条规矩。

## 支付宝（实验性）

支付宝依赖三处**未文档化**能力：逻辑层的标准 `WebAssembly`、Worker 里的 `crypto.getRandomValues`、找回真实全局对象。
开发者工具与 iOS 真机验证过（US-211 支付宝探针 v7），**Android 真机未验证**，配额也没撞到过（`quota-unobserved`），
平台改掉任一项未文档化行为时引导直接报 `AlipayUndocumentedCapabilityError`，不降级。

代码包要放三样东西（esbuild 参考 `apps/dev-rxdb-miniprogram-alipay-probe/scripts/build.mjs`，Taro（Vite）参考
`apps/dev-rxdb-miniprogram` 的 `config/assets-vite-plugin.ts`）：

```text
@aiao/rxdb-adapter-miniprogram/alipay-random-worker.js  →  workers/index.js（预编译 ES5，原样拷贝）
@subframe7536/sqlite-wasm/wasm                          →  wa-sqlite/wa-sqlite.wasm
同一份 wasm 的 base64 文本                               →  wa-sqlite/wa-sqlite.wasm.base64.txt
```

`app.json` 声明 `"workers": ["workers/index.js"]`；`mini.project.json` 配
`"compileOptions": { "transpile": { "script": { "ignore": ["workers/**"] } } }`，否则 IDE 会给 Worker 换进
跑不起来的 core-js。文本副本是给开发者工具模拟器的：它把代码包文件当 UTF-8 文本读，二进制被改写；wasm 运行时
按锁定版本的指纹先读 `.wasm`、对不上再读副本，都对不上就抛错。

模拟器逻辑层没有 `BigInt`，要等 `prepareMiniProgramHostRuntime` 补上。所以 RxDB 栈（`@aiao/rxdb`、adapter 主入口、rxjs）
必须留在动态 `import()` 的 chunk 里，在引导之后才求值：es2018 产物里模块顶层的 `BigInt("…")` 一求值就抛错。
打包器按引用数把它们拆进页面静态 `require` 的公共 chunk 时就会出这个问题，Taro 的 `manualChunks` 正是如此；
Taro 示例用 `config/lazy-chunk-vite-plugin.ts` 把只经动态 `import()` 可达的模块并进单独的懒加载 chunk。

开发者工具的「真机调试」不用原生引擎，而是用 Boatman（一个 JS 写的 JS 解释器）跑逻辑层。它提升 `var` 时不看标签语句（`label: {…}`）内部：
这类 `var` 只有真执行到才登记进函数作用域。没执行到的那次调用里，对同名变量的赋值会写进外层闭包。React 18 的
reconciler 正好踩中（`beginWork` 在 `e:{…}` 里 `var o`，把工厂闭包里的 `Symbol.for("react.element")` 写成元素对象），
页面渲染时就抛 React #31。预览、体验版与模拟器都是原生引擎，不受影响。Taro 示例用 `config/labeled-var-hoist-vite-plugin.ts`
在产物定稿时把这类 `var` 补声明到函数开头（ES 语义不变），其他应用要在真机调试里跑，同样需要这一步。

Boatman 还有一处偏差：成员赋值 `o.x = v` 调完 setter 会再调一次 getter，拿 getter 的返回值当赋值表达式的值。
实体类里的关系属性要写 `declare parent$: …`，不能写成 `parent$!: …` 字段：降级成 `this.parent$ = void 0` 后，构造时就会经过
原型上的关系 accessor，Boatman 再去读 getter，这时实体状态还没挂上，报 `Target has no entity status`。`@aiao/rxdb`
的系统实体已经按这个写法改好。

```typescript
async function createDatabase() {
  const runtime = await import('@aiao/rxdb-adapter-miniprogram/runtime');
  const randomWorker = my.createWorker('workers/index.js', { useExperimentalWorker: true });
  // 逻辑层没有 WebAssembly 时读自由变量会抛 ReferenceError，先用 typeof 判
  const webAssembly = typeof WebAssembly === 'undefined' ? undefined : WebAssembly;
  const host = runtime.createAlipayMiniProgramHost(my, { randomWorker, webAssembly });
  // 检查 WebAssembly、补 BigInt 与 queueMicrotask、经 Worker 取随机数
  await runtime.prepareMiniProgramHostRuntime(host);

  const [rxdbPackage, adapterPackage] = await Promise.all([
    import('@aiao/rxdb'),
    import('@aiao/rxdb-adapter-miniprogram')
  ]);
  const moduleFactory = await adapterPackage.loadSubframeModuleFactory();
  // webAssembly 为 undefined 时上面的引导已报 logic-layer-webassembly 缺失，到不了这里
  const wasmRuntime = adapterPackage.createAlipayWasmRuntime(my, webAssembly!);
  const database = new rxdbPackage.RxDB({/* 同微信 */});
  database.adapter(
    adapterPackage.ADAPTER_NAME,
    db => new adapterPackage.RxDBAdapterWaSqliteMiniProgram(db, { moduleFactory, host, wasmRuntime })
  );
  return database;
}
```

支付宝 host 的固定行为：

- `fileLayout: { kind: 'chunked', chunkBytes: 65536 }`：只能整文件读写、单文件上限 10 MiB，整文件落盘会让库大小被单文件上限卡死。
- 同步 FS 失败时返回错误对象而不抛：host 把它转成抛错，错误码 10022 / 10025 / 10028 归一成 VFS 认得的文案，平台原文挂在 `cause` 上。
- 读写一律走 base64，每个用户文件前垫 1 字节帧头（模拟器拒绝任何空写入）；所以落盘格式与别的平台不同，平台之间本来就不共享数据目录。
- 不传 `runtimeGlobal` 时，环境有 `globalThis` 就用它（iOS 真机），没有（开发者工具模拟器）就经 `Object.prototype` 上临时定义的 getter 找出来。

## 宿主契约

`wechat: wx` 是 `host: createWechatMiniProgramHost(wx)` 的便利形状，二者恰好传一个，都传或都不传
直接报错。
对应的配置类型是 `WaSqliteMiniProgramOptions`（微信形状，仍是 interface，可被 `extends`）与
`WaSqliteMiniProgramHostOptions`，adapter 与客户端接收二者的联合 `WaSqliteMiniProgramAdapterOptions`。
宿主的 `requestRandomValues` 每次必须返回新分配的 `Uint8Array`，交出后不再读写：运行时直接把它
当随机池，逐段发出并原地擦零；复用仍在使用的缓冲区会被识别为违约并拒绝。宿主缺少
`requestRandomValues` 时引导直接失败。传了 `databaseRoot` 的配置不再要求宿主提供用户数据目录；
空串目录一律按缺失处理。
`MiniProgramHost` 把平台相关的部分收成一个注入点：平台 id、同步文件系统、用户数据目录、
安全随机源，以及报错里使用的能力名。运行时引导对应 `prepareMiniProgramHostRuntime(host)`，
文件 VFS 对应 `createMiniProgramFileVFS(module, { host, databaseName })`，
wasm 加载对应 `loadWaSqliteMiniProgramModule(options, host)`（`host` 必传，报错用它的 `wasmRuntimeName`）。
所有宿主共享同一张单连接表，同一数据库文件的第二个连接一律拒绝。

宿主还有四个可选字段，微信都不设，行为与不设时完全一致；抖音 host 设了前三个（见「抖音」），支付宝 host 设了 `runtimeGlobal`、`fileLayout` 与 `prepareRuntime`（见「支付宝」）：

| 字段              | 缺省                  | 用途                                                                                                                                                                                                                                                                                |
| ----------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtimeGlobal`   | 环境里的 `globalThis` | 运行时补丁写入、能力预检读取的真实全局对象。环境的 `globalThis` 不可用（如被页面包装函数遮蔽成 `undefined`）时由调用方在非严格代码里取到后注入。不是当前 realm 的全局对象时直接报「请经 host.runtimeGlobal 注入」，不回退、不猜；解析逻辑见 `resolveMiniProgramRuntimeGlobal(host)` |
| `fileLayout`      | `{ kind: 'single' }`  | `chunked` 把逻辑文件 `P` 存成 `P.0`、`P.1`… 定长块，落盘只重写脏块；每个库另占 2×`chunkBytes` 的回滚余量（`<库>.rxdb-reserve`），撞配额时让出给回滚，`MiniProgramFileVFS.reserveHeld` 报告当前是否占着。两种布局互不兼容，声明 `chunked` 而目录里已有单文件库时直接拒绝，不迁移     |
| `defaultWasmPath` | `DEFAULT_WASM_PATH`   | 未传 `wasmPath` 时加载的代码包内路径。相对路径按当前页面目录解析的平台要声明以 `/` 开头的代码包根路径                                                                                                                                                                               |
| `prepareRuntime`  | 不调用                | `prepareMiniProgramHostRuntime` 在平台断言与解析真实全局对象之后、装 polyfill 之前调用，给平台补缺的全局或检测依赖的能力；reject 时引导失败、不申请随机数                                                                                                                           |

`getMiniProgramRuntimeSources(runtimeGlobal?)` 按同样规则读来源：传了就读它，否则读环境的 `globalThis`。

用户数据目录写满时，事务以 `SQLITE_FULL`（13）失败，平台原文经 `cause` 链透传：
`RxDBAdapterSqliteError` → SQLite 错误 → VFS 错误 → 平台原始错误（`errMsg` / `message`）。
单文件布局撞配额后库的状态按「无崩溃恢复」处理。

`structuredClone` 的 polyfill 只经自由变量引用内置构造函数，不读 `self` / `globalThis`，
所以在全局对象被遮蔽的页面模块里克隆类型化数组、包装对象与 `Error` 同样可用；函数与 symbol 抛 `TypeError`。

**目前登记的平台是 `wechat`、`douyin` 与 `alipay`**（`MINI_PROGRAM_PLATFORM_IDS`）。其他平台 id 在连接前失败，不会回退到 `wx`：
可行性矩阵判 `unsupported` 的平台抛 `MiniProgramUnsupportedPlatformError`（继承 `MiniProgramUnknownPlatformError`），
`blockers` 与报错文案带出矩阵里的阻断项和判定章节——支付宝 2026-10-04 改判 `supported` 后这张表为空；
其余抛 `MiniProgramUnknownPlatformError`。这个契约的存在不代表支持百度或 QQ 小程序；
各平台的可行性结论见
[miniprogram-platform-feasibility.md](../../requirements/stories/adapter/miniprogram-platform-feasibility.md)。

## 打包器注意事项

glue 是 ESM，内部有 `var _scriptName = import.meta.url` 和
`new URL('wa-sqlite.wasm', import.meta.url)`。两处都有麻烦：小程序运行时没有 `import.meta`，
而后者会被 vite 识别成资产引用，把 727 KB 的 wasm 以 base64 内联进产物（代码包凭空多出约 1 MB）。

这两处分支在显式传 `locateFile` + `instantiateWasm` 时永远走不到，所以宿主构建把 glue 里的
`import.meta.url` 替换成空串即可。Taro 示例的 `subframeSqliteWasmVitePlugin()`
（见 [config/rxdb-packages-vite-plugin.ts](../../apps/dev-rxdb-miniprogram/config/rxdb-packages-vite-plugin.ts)）就做这件事，
wasm 等运行时文件由同目录的 [config/assets-vite-plugin.ts](../../apps/dev-rxdb-miniprogram/config/assets-vite-plugin.ts) 发进产物。

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
