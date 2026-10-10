# 小程序适配器（实验性）

`@aiao/rxdb-adapter-miniprogram` 是实验性的微信 / 抖音 / 支付宝小程序**单连接** RxDB 适配器。它复用
`@aiao/rxdb-adapter-sqlite-core` 的仓库、事务、迁移和变更事件，用平台的 WASM 入口（`WXWebAssembly` /
`TTWebAssembly` / 支付宝逻辑层的 `WebAssembly`）加载同步版 wa-sqlite，并把数据库文件写入平台用户目录
（`wx.env.USER_DATA_PATH` / `tt.getEnvInfoSync().common.USER_DATA_PATH` / `my.env.USER_DATA_PATH`）。

## 实验性边界

:::warning 接入前请确认下列限制可接受

| 维度     | 支持情况                                                                                                                                                                                                   |
| :------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 平台     | **微信**、**抖音**与**支付宝**小程序的逻辑层，不是通用「小程序」适配器；逐平台结论见下节。抖音与支付宝都只在开发者工具与 iOS 真机上验证过，**Android 真机未验证**；支付宝还依赖未文档化能力（见「支付宝」）。百度、QQ 不支持 |
| 并发     | 只支持同步 `wa-sqlite.wasm`、单 JavaScript realm、**强制单连接**：同一数据库文件的第二个连接直接抛错，并发安全由 JS 层保证而非 SQLite 锁                                                                   |
| 日志模式 | `journal_mode = DELETE`（rollback journal），**不支持 WAL**、Worker、SharedWorker、跨页面并发连接                                                                                                         |
| 崩溃恢复 | **无保证**——三个平台的文件 API 都没有提供 SQLite 所需的可靠 `fsync`、文件锁和原子重命名语义                                                                                                               |
| 数据量   | VFS 会把整个数据库文件缓冲在内存中，当前只适合约 10 MB 内的兼容性验证，不适用于大数据量场景                                                                                                                |
| 配额     | 与内存缓冲分开算。抖音用户目录总共约 10 MB（iOS 实测一次最多写入 9 MiB），库文件、`-journal` 与每库 128 KiB 的回滚余量共用；写满时事务以 `SQLITE_FULL` 失败，平台原文在 `cause` 链上，已提交的数据重开仍在 |
| 随机源   | 由 `wx.getRandomValues` / `tt.getRandomValues` / 支付宝 Worker 里的 `crypto.getRandomValues` 预取 64 KiB 随机池并在见底前后台补给；补给失败且余量耗尽时抛错，**任何情况下都不降级**到 `Math.random`        |
| 全文搜索 | wasm 已编入 FTS5，可直接写 SQL 虚拟表；但 `@aiao/rxdb-plugin-search` 尚未放行本适配器                                                                                                                     |

:::

## 平台支持

| 平台            | 结论       | 原因 / 边界                                                                                                                                                                                                                                      |
| :-------------- | :--------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 微信 `wechat`   | 实验性支持 | 上表边界全部适用                                                                                                                                                                                                                                 |
| 抖音 `douyin`   | 实验性支持 | 上表边界全部适用；开发者工具与 iOS 真机验证过，**Android 真机未验证**                                                                                                                                                                            |
| 支付宝 `alipay` | 实验性支持 | 上表边界全部适用；依赖四项**未文档化**能力（逻辑层的标准 `WebAssembly` 与 `BigInt`、Worker 里的 `crypto` 随机源、找回真实全局对象），平台改掉任一项时引导直接报错、不降级；开发者工具与 iOS 真机验证过，**Android 真机未验证**，配额上限没观测到 |
| 百度 `baidu`    | 不支持     | 找不到安全随机源与 WASM 入口（文档没有，也没有实测）                                                                                                                                                                                             |
| QQ `qq`         | 不支持     | 找不到安全随机源与 WASM 入口（文档没有，也没有实测）                                                                                                                                                                                             |

平台判定依据与复议条件详见可行性矩阵。

## 安装

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-miniprogram
```

### wasm 打包

wa-sqlite 的 Emscripten glue 与 wasm 二进制都取自
[`@subframe7536/sqlite-wasm`](https://www.npmjs.com/package/@subframe7536/sqlite-wasm)，本包把它列为**精确版本**依赖
（当前锁 1.3.1）：glue 只经 `./dist/*` 暴露、文件名带内容哈希，用 `^` 放宽会让 `loadSubframeModuleFactory()` 指向不存在的文件。

1.4.0 的 glue 把 `_sqlite3_version` 改成读 wasm 导出的 Global，而 iOS 微信的 `WXWebAssembly` 不导出 Global，真机初始化即报
`undefined is not an object`；开发者工具模拟器用的是标准 WebAssembly，测不出来。升级前必须过 glue 导出 Global 的回归门禁。

宿主应用只需把 wasm 复制进小程序代码包，glue 由 `loadSubframeModuleFactory()` 自行定位：

```text
@subframe7536/sqlite-wasm/wasm  →  代码包内 wa-sqlite/wa-sqlite.wasm
```

- 源子路径导出为 `SUBFRAME_WASM_SUBPATH`，代码包内的目标路径导出为 `DEFAULT_WASM_PATH`。
- glue 与 wasm 是一对，跨构建混用会 `LinkError`。
- Taro（Vite）项目不用手抄构建配置，装 `@aiao/rxdb-taro` 即可，见 [Taro（小程序）](../frameworks/taro.md)。

## 运行时引导与建库

连接前必须先等待 `/runtime` 的引导——微信用 `prepareMiniProgramRuntime(wx)`，抖音用
`prepareMiniProgramHostRuntime(createDouyinMiniProgramHost(tt, { runtimeGlobal }))`，支付宝用
`prepareMiniProgramHostRuntime(createAlipayMiniProgramHost(my, { randomWorker, webAssembly }))`。引导会经平台的
`getRandomValues` 预取同步安全随机池，并补齐 `structuredClone`、`TextEncoder`、`TextDecoder` 和 `performance.now`。
缺少可信随机源、随机池耗尽或平台调用失败时会立即报错，不会降级为非加密随机数。在引导完成前不要加载任何 RxDB、
adapter 主入口或 wa-sqlite glue。

- 随机池默认 `DEFAULT_MINI_PROGRAM_RANDOM_POOL_SIZE`（64 KiB），剩余量跌到四分之一时后台自动补给下一池；
  `randomPoolSize` 可上调到 `wx.getRandomValues` 的单次上限 1 MiB。单次 `crypto.getRandomValues` 请求超过
  `randomPoolSize` 时直接抛 `RangeError`。
- `wx.getRandomValues` 需要微信基础库 2.15.0 或更高版本；抖音随机源按基础库 2.87.0 起算。运行时还必须原生提供
  `BigInt` 与 `queueMicrotask`。
- `checkMiniProgramRuntimeCapabilities()` 可在连接前显示完整能力矩阵和能力来源。

### 微信

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

`wechat: wx` 是 `host: createWechatMiniProgramHost(wx)` 的便利形状，二者恰好传一个，都传或都不传直接报错。

### 抖音

抖音没有 `wechat` 那样的便利形状，一律经 `createDouyinMiniProgramHost(tt, options)` 注入 host。抖音页面模块里
`globalThis` 是 `undefined`，要在**非严格模式**的代码里取到真实全局对象后注入：

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

- **64 KiB 分块存储**：抖音覆盖写已有文件时，旧文件在写成功前仍计入配额，整文件落盘会让库上限只剩配额的一半，
  撞配额后回滚也没空间。
- **`defaultWasmPath: '/wa-sqlite/wa-sqlite.wasm'`**：抖音按当前页面目录解析相对路径，只有代码包根的绝对路径
  在任意页面都能加载。wasm 照样复制到代码包根的 `wa-sqlite/wa-sqlite.wasm`。
- **随机源走 `tt.getRandomValues`**，单次上限同样是 1 MiB。

iOS 抖音没有原生 `TextEncoder` / `TextDecoder`，adapter 的 polyfill 要到 `prepareMiniProgramHostRuntime` 才装，
所以打进产物的代码**不能在模块顶层构造编码器**，要等第一次用到再建。

Taro 项目可以直接用 [Taro 运行时入口](../frameworks/taro.md#运行时入口) 按构建平台取 host 与 WASM 运行时，
不用自己写 `wx` / `tt` 分支。

### 支付宝

:::warning 依赖四项未文档化能力，Android 真机未验证

支付宝依赖四项**未文档化**能力：逻辑层的标准 `WebAssembly`、逻辑层的原生 `BigInt`（模拟器的全局上没有，经 wasm
i64 返回值的构造器取回）、Worker 里的 `crypto.getRandomValues`、找回真实全局对象。开发者工具与 iOS 真机验证过，
**Android 真机未验证**，配额也没撞到过。平台改掉任一项未文档化行为时引导直接报 `AlipayUndocumentedCapabilityError`，
不降级。

:::

代码包要放三样东西。Taro（Vite）项目首选 `@aiao/rxdb-taro/vite` 的 `miniProgramVitePlugins('alipay', appRoot)` 发出
（见 [Taro（小程序）](../frameworks/taro.md#支付宝实验性)），它同时负责模拟器里的真实全局对象登记；其他打包器自行拷贝：

```text
@aiao/rxdb-adapter-miniprogram/alipay-random-worker.js  →  workers/index.js（预编译 ES5，原样拷贝）
@subframe7536/sqlite-wasm/wasm                          →  wa-sqlite/wa-sqlite.wasm
同一份 wasm 的 base64 文本                               →  wa-sqlite/wa-sqlite.wasm.base64.txt
```

- `app.json` 声明 `"workers": ["workers/index.js"]`；`mini.project.json` 配
  `"compileOptions": { "transpile": { "script": { "ignore": ["workers/**"] } } }`，否则 IDE 会给 Worker 换进跑不起来的 core-js。
- 文本副本是给开发者工具模拟器的：它把代码包文件当 UTF-8 文本读，二进制被改写；wasm 运行时按锁定版本的指纹先读
  `.wasm`、对不上再读副本，都对不上就抛错。
- 模拟器逻辑层没有 `BigInt`，要等 `prepareMiniProgramHostRuntime` 补上。所以 RxDB 栈（`@aiao/rxdb`、adapter 主入口、rxjs）
  必须留在动态 `import()` 的 chunk 里，在引导之后才求值；打包器把它们并进页面静态 `require` 的公共 chunk 时就会出问题
  （Taro 的 `manualChunks` 正是如此，需要懒加载分包的插件处理）。
- 开发者工具的「真机调试」用 Boatman（JS 写的 JS 解释器）跑逻辑层，它有两处偏差：标签语句（`label: {…}`）内部的
  `var` 不提升（React 18 的 reconciler 正好踩中，页面渲染抛 React #31），需要构建期补声明；成员赋值 `o.x = v` 调完
  setter 会再读一次 getter——实体类里的关系属性要写 `declare parent$: …`，不能写成 `parent$!: …` 字段。预览、体验版与
  模拟器都是原生引擎，不受影响。

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

## 打包器注意事项

glue 是 ESM，内部有 `var _scriptName = import.meta.url` 和 `new URL('wa-sqlite.wasm', import.meta.url)`。两处都有麻烦：
小程序运行时没有 `import.meta`，而后者会被 vite 识别成资产引用，把约 0.7 MB 的 wasm 以 base64 内联进产物
（代码包凭空多出约 1 MB）。这两处分支在显式传 `locateFile` + `instantiateWasm` 时永远走不到，所以宿主构建把 glue 里的
`import.meta.url` 替换成空串即可。

Taro（Vite）项目在 `config/index.ts` 的 `plugins` 里加一行 `'@aiao/rxdb-taro'`（微信、抖音）即可：这一步、wasm 发进
代码包、抖音的真实全局对象绑定，以及把 Taro 写死的 `es6` 构建目标抬到 es2020 都由它完成；其他 vite 项目用
`@aiao/rxdb-taro/vite` 的 `miniProgramVitePlugins()` 自行组装。详见 [Taro（小程序）](../frameworks/taro.md)。

## 全文搜索与 FTS5

- `@subframe7536/sqlite-wasm` 的构建开启了 `ENABLE_FTS5`，所以小程序侧可以建 FTS5 虚拟表，`rxdb_fts_bigram` 也随基类一起
  注册（中文需要它切 bigram，否则整段只成一个 token）。
- 但 `@aiao/rxdb-plugin-search` 的后端注册表仍把 `wa-sqlite-miniprogram` 标为 `unverified`：在本适配器上注册搜索插件时抛
  `SearchUnsupportedAdapterError` fail-fast。放行名单与状态见[插件文档](../plugins/rxdb-plugin-search/README.md)。
- 真机（微信基础库）上的 FTS5 表现尚无实测。
- 建表时列名不能与表名相同——FTS5 声明 vtab 时会额外加一列与表同名，撞名即重复列，只会报不透明的
  `vtable constructor failed: <table>`。

## 相关文档

- [Taro（小程序）](../frameworks/taro.md)
- [数据库适配器](./README.md)
- [版本兼容矩阵](../compatibility.md)
