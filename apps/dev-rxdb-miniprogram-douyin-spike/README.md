# 抖音小程序 spike（US-211 阶段 B 前置实验）

一个打开即跑的抖音小程序，自动做完 [可行性矩阵](../../requirements/stories/adapter/miniprogram-platform-feasibility.md) 抖音一节「缺的实验」①～⑤，产出一份 JSON 报告用于回填矩阵。

它不是 adapter 的抖音实现：host 借用已登记的 `wechat` 平台 id 通过 adapter 校验，正式的 `douyin` id 与 host 属于阶段 B。除平台 id 外，实验 host 只用 adapter 的公开字段：`runtimeGlobal`（banner 找到的真实全局对象）、`fileLayout: { kind: 'chunked', chunkBytes: 65536 }`、`defaultWasmPath: '/wa-sqlite/wa-sqlite.wasm'`。产物里没有任何垫片，报告的 pass 就是 adapter 现状可用。

## 跑一次

1. 构建：`pnpm nx build dev-rxdb-miniprogram-douyin-spike`，产物在本目录的 `dist/`
2. 抖音开发者工具 →「导入项目」→ 选 `dist/`。`project.config.json` 里的 `appid` 是占位的 `testAppId`，要换成真实 AppID（在工具里改，或改 `dist/project.config.json`；别把真实 AppID 提交进 `static/`）
3. 页面打开就自动跑。配额实验要把用户目录写满 10M，需要等一会儿
4. 点「复制报告」，或在控制台搜 `[douyin-spike] 报告`
5. 开发者工具模拟器、Android 真机预览、iOS 真机预览**各跑一份**。矩阵回填要三份报告，单份只代表那一台设备

## 报告怎么读

`findings` 是按矩阵行给出的本次判定（✅ pass / ❌ fail / ⚠️ unknown），证据在它引用的字段里：

| 矩阵行   | 实验 | 看哪些字段                                                                                                                                                                                                                                                                                                                                                      |
| -------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WASM     | ①    | `core.persistence.wasmPath`：adapter 按 `host.defaultWasmPath` 实际交给 `instantiate` 的路径，核心实验不传 `wasmPath`。`wasmPath` 只是探测：相对 / 绝对两种写法逐个 `compile`，`workingPath` 是可用的那个。只有 `core.persistence` 通过才判 pass，单靠 compile 成功只算 unknown                                                                                 |
| 同步 FS  | ③    | `fileSystem.probes`：9 条同步调用的原始错误（`errMsg`、`errNo`、构造器）以及 adapter VFS 正则对它的判定（`vfsSaysMissing` / `vfsSaysExists`）                                                                                                                                                                                                                   |
| 随机源   | ②    | `random`：直接调 `tt.getRandomValues` 取 64 KiB、1 MiB、1 MiB+1 字节的原始结果；`prepare`：adapter 引导随机池是否成功                                                                                                                                                                                                                                           |
| 用户目录 | ④    | `core.quota`：持续写 blob 直到失败，记下失败行、错误、同连接 / 关闭 / 重开后的行数与 `integrity_check`，以及关闭后的库文件（`filesAfterDisconnect`）。撞配额后不删任何文件直接重开；pass 要求失败错误的 cause 链上有 `SQLITE_FULL`（`code: 13`）与平台配额原文，且重开后行数等于已提交行数、`integrity_check` 为 `ok`。`quotaAccounting` 不经 SQLite 测配额计费 |
| 持久化   | ①    | `core.persistence`：建库、写入（含中文与 emoji）、关闭、重开、读回、`integrity_check`、列出库文件                                                                                                                                                                                                                                                               |
| 版本     | ⑤    | `environment`：系统信息、基础库版本与门槛（随机源 2.87.0、WASM 2.34.0.0）、`freeGlobals`（自由变量读到的全局 `typeof`，含 `globalThis` 本身）与 `globalObject`（经 `globalThis` 按名读取），以及原生 `TextDecoder` 各编码能否构造（只作记录）                                                                                                                   |

`coreLoad` / `core` 出现 `skipped` 时，① ④ 没跑，原因写在字符串里，其余实验照常出结果。iOS 真机的 `require` 会吞掉核心包的模块顶层错误、返回半成品导出，所以核心包外层有一层构建包装：原始错误挂在导出的 `initError` 上再原样抛出，`coreLoad` 报的就是这个原始错误；包装也没接住时，以导出里的 `realmProbe` 为 `undefined` 判「半成品导出」。

`realmProbe` 记录两个包（`page` / `core`）的构建 banner：`before` 是模块作用域里的 `typeof globalThis`；不是对象时，banner 依次试 `sloppyThis`（非严格函数的 `this`）、`Function`（`Function('return this')()`）、`global` 三条路，每条的类型、是否真实全局对象（`isRealm`：对象字面量 `{}` 的原型就是它的 `Object.prototype`，与 adapter `resolveMiniProgramRuntimeGlobal` 同判据；`promiseMatchesFree` 只作旁证，抖音的包装函数换掉了自由变量 `Promise`，这一项恒为 false）、`BigInt` / `queueMicrotask` 都记在 `candidates` 里，`chosen` 是选中的那条。banner 不改 `globalThis`，页面包把选中的对象经 `host.runtimeGlobal` 交给 adapter；没有可用的（`chosen: null`）就不传，adapter 报「请经 host.runtimeGlobal 注入」。

`quotaAccounting` 先统计整个用户目录的起始占用（`userDirBefore`，别处占掉的配额也在里面），再逐 MiB 写入并立即删除单个文件，`largestFreshWriteBytes` 是一次能写进去的最大值；`overwrite` 在同一路径先写 6 MiB 再覆盖写 6 MiB，`countsOldSize` 为 `true` 说明覆盖写期间旧文件仍计入配额（首次写入就失败时为 `null`）。这一项为 `true` 时，单文件布局（微信）每次 flush 都整体覆盖库文件，库的实际上限只有配额的一半；分块布局只覆盖脏块，不受这条影响。

`environment.residue` 为 `true` 说明同一 JS 上下文里之前跑过引导（页面上的「重新运行」、热重载都不换上下文），`sourcesBeforePrepare` 与 `globalObject` 看到的是上次的补丁。要拿干净快照：关掉开发者工具重开，或「清缓存 → 全部清除」后重新编译，第一次自动运行的报告才算数。真机上要先把抖音从后台彻底划掉，再重新扫码预览。`environment.nativeRandom` 直接调自由变量 `crypto.getRandomValues`，不经 `tt`，用来判断平台本身有没有 Web Crypto 随机源。

## 已知会卡住的地方

已实测的（「模拟器」指抖音开发者工具，基础库 4.27–4.30；「iOS」指 iPhone 17 Pro Max / iOS 26.6.2 / 抖音 40.6.0 / 基础库 4.33.0，v6 报告）：

- **页面模块里 `globalThis` 是 `undefined`，`global` 是对象但不是真实全局对象**：`global` 上没有 `BigInt` / `Promise` / `WebAssembly` / `queueMicrotask`，而这些自由变量都能直接用；非严格函数的 `this` 是真实全局对象。adapter 经 `host.runtimeGlobal` 接收它，不注入时报稳定错误、不猜。成因是模块包装函数遮蔽（**推断**），`dist-smoke.spec.ts` 的两种遮蔽模式（真实全局对象可达 / 不可达）按此复现
- **相对 wasm 路径按页面目录解析**：`wa-sqlite/wa-sqlite.wasm` 被解析成 `pages/index/wa-sqlite/wa-sqlite.wasm` 而失败，只有 `/wa-sqlite/wa-sqlite.wasm` 能用。抖音 host 经 `defaultWasmPath` 声明绝对路径，adapter 的默认值（微信用）不变
- **文件错误码与文档不符**：错误是 `name: 'API_ERROR'` 的实例，没有 `errMsg`，文案在 `message`（`accessSync:fail no such file or directory, …`）；不存在 / 已存在是 errNo 21102，readFile 缺失与写满配额是 21103，模拟器与 iOS 一致。文档里的 108xxx 只在 iOS 的 `errorCode` 上出现（模拟器是 0）。adapter VFS 按文案正则判定，`adapterErrorText` 会回落到 `message`，所以判定照样成立；不能按错误码分类
- **覆盖写时旧文件仍计入配额**（模拟器与 iOS 都实测 `countsOldSize: true`）：裸文件一次写 10 MiB 成功、11 MiB 失败，但同一路径先写 6 MiB 再覆盖写 6 MiB 就报 `user dir saved file size limit exceeded`（errNo 21103），失败后旧文件原样保留。单文件布局下库到约 5 MiB 就写不进，撞上之后重开要回滚热日志、整体覆盖库文件，需要约 2 × 库大小，超过 10 MiB，库永久打不开（模拟器 v6 实测）。抖音 host 因此声明分块布局：库存成 `P.0`、`P.1`… 的 64 KiB 块，flush 只覆盖脏块；每个库另占 2 × 块大小的回滚余量（`<库>.rxdb-reserve`），撞配额时先让出余量再报 `SQLITE_FULL`，保证回滚有空间。Node 替身开 `overwriteCountsOldSize` 复现：撞配额后不清理直接重开，已提交行完整（`run-spike.spec.ts`、`dist-smoke.spec.ts`）；真机待 v9 报告确认
- **iOS 一次写不进 10 MiB**：裸文件 9 MiB 成功、10 MiB 就报配额错误，起始占用是 0 个文件（模拟器 10 MiB 成功、11 MiB 失败）。差的这 1 MiB 计在哪里不知道，配额按「略小于 10 MiB」估
- **iOS 没有原生 `TextDecoder`**：`sourcesBeforePrepare.textDecoder` 是 `polyfill`。adapter 的 polyfill 只认 utf-8 / utf-16le；`rxdb-adapter-sqlite-core` 已不在模块顶层构造 latin1 解码器，核心包加载不再依赖它。`dist-smoke.spec.ts` 的无 `TextDecoder` 用例（含遮蔽 + 无编码全局的 iOS 形态）覆盖这条路径
- **iOS 没有 `atob` / `btoa`**：adapter VFS 自带 Base64 解码，不受影响
- **`statSync(目录, true)` 返回的 `path` 相对于被查询的目录**（`/rxdb-persistence.sqlite`），不是完整路径；Node 替身返回完整路径，两边对不上
- **`getRandomValues` 单次上限 1 MiB**：1048577 字节报 errNo 21401（`The value of 'length' is out of range`），adapter 随机池 64 KiB 不受影响

尚待真机确认的：

- **Android 的全部行为**：还没有 Android 报告
- **配额失败的错误形态**：adapter 把平台配额错误映射成 `SQLITE_FULL`（13），平台原文经 cause 链透传（`RxDBAdapterSqliteError` → `SQLiteError` → VFS 错误 → 平台原始错误）；Node 替身已验证，真机待 v9 报告确认

## 本地测试

`pnpm nx test dev-rxdb-miniprogram-douyin-spike` 用的是 [Node 测试替身](src/__tests__/fake-douyin.ts)，**不是实验证据**。错误码与文案取自抖音文档，`wasm` 用真实字节：

- `run-spike.spec.ts` 跑源码
- `dist-smoke.spec.ts` 把构建产物放进只有 ECMAScript 内置对象的 vm 上下文里跑，覆盖打包后才会出现的模块顶层问题
- `vfs-classifiers.spec.ts` 逐字比对 adapter VFS 里的缺失 / 已存在 / 配额正则，adapter 改了正则这里就红，免得报告里的 `vfsSaysMissing` / `vfsSaysExists` 与 adapter 实际判定脱节
