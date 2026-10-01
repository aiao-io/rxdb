# 抖音小程序 spike（US-211 阶段 B 前置实验）

一个打开即跑的抖音小程序，自动做完 [可行性矩阵](../../requirements/stories/adapter/miniprogram-platform-feasibility.md) 抖音一节「缺的实验」①～⑤，产出一份 JSON 报告用于回填矩阵。

它不是 adapter 的抖音实现：host 借用已登记的 `wechat` 平台 id 通过 adapter 校验，正式的 `douyin` id 与 host 属于阶段 B。

## 跑一次

1. 构建：`pnpm nx build dev-rxdb-miniprogram-douyin-spike`，产物在本目录的 `dist/`
2. 抖音开发者工具 →「导入项目」→ 选 `dist/`。`project.config.json` 里的 `appid` 是占位的 `testAppId`，要换成真实 AppID（在工具里改，或改 `dist/project.config.json`；别把真实 AppID 提交进 `static/`）
3. 页面打开就自动跑。配额实验要把用户目录写满 10M，需要等一会儿
4. 点「复制报告」，或在控制台搜 `[douyin-spike] 报告`
5. 开发者工具模拟器、Android 真机预览、iOS 真机预览**各跑一份**。矩阵回填要三份报告，单份只代表那一台设备

## 报告怎么读

`findings` 是按矩阵行给出的本次判定（✅ pass / ❌ fail / ⚠️ unknown），证据在它引用的字段里：

| 矩阵行   | 实验 | 看哪些字段                                                                                                                                                                                                                                   |
| -------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WASM     | ①    | `wasmPath`：相对 / 绝对两种路径写法逐个 `compile`，`workingPath` 是可用的那个。只有 `core.persistence` 通过才判 pass，单靠 compile 成功只算 unknown                                                                                          |
| 同步 FS  | ③    | `fileSystem.probes`：9 条同步调用的原始错误（`errMsg`、`errNo`、构造器）以及 adapter VFS 正则对它的判定（`vfsSaysMissing` / `vfsSaysExists`）                                                                                                |
| 随机源   | ②    | `random`：直接调 `tt.getRandomValues` 取 64 KiB、1 MiB、1 MiB+1 字节的原始结果；`prepare`：adapter 引导随机池是否成功                                                                                                                        |
| 用户目录 | ④    | `core.quota`：持续写 blob 直到失败，记下失败行、错误、同连接 / 关闭 / 重开后的行数与 `integrity_check`，以及关闭后的库文件（`filesAfterDisconnect`）。`quotaAccounting` 不经 SQLite 测配额计费，平台原始文案在 `fileSystem` 的 11 MiB 探测里 |
| 持久化   | ①    | `core.persistence`：建库、写入（含中文与 emoji）、关闭、重开、读回、`integrity_check`、列出库文件                                                                                                                                            |
| 版本     | ⑤    | `environment`：系统信息、基础库版本与门槛（随机源 2.87.0、WASM 2.34.0.0）、`freeGlobals`（自由变量读到的全局 `typeof`，含 `globalThis` 本身）与 `globalObject`（经 `globalThis` 按名读取），以及 `TextDecoder` 各编码能否构造                |

`coreLoad` / `core` 出现 `skipped` 时，① ④ 没跑，原因写在字符串里，其余实验照常出结果。iOS 真机的 `require` 会吞掉核心包的模块顶层错误、返回半成品导出，所以核心包外层有一层构建包装：原始错误挂在导出的 `initError` 上再原样抛出，`coreLoad` 报的就是这个原始错误；包装也没接住时，以导出里缺 banner 记录判「半成品导出」。

`globalThisShim` 记录两个包（`page` / `core`）的构建 banner：`before` 是垫之前的 `typeof globalThis`；不是对象时，banner 依次试 `sloppyThis`（非严格函数的 `this`）、`Function`（`Function('return this')()`）、`global` 三条路，每条的类型、是否真实全局对象（`isRealm`：对象字面量 `{}` 的原型就是它的 `Object.prototype`；`promiseMatchesFree` 只作旁证，抖音的包装函数换掉了自由变量 `Promise`，这一项恒为 false）、`BigInt` / `queueMicrotask` 都记在 `candidates` 里，`chosen` 是换进 `globalThis` 的那条，没有真实全局对象可用就不垫（`chosen: null`），adapter 按现状失败。垫过时，除「同步 FS」外的 findings 证据都带「前提：globalThis 垫片」后缀：那几行的 pass 说明平台能力够用，**不说明** adapter 现状可用。

`quotaAccounting` 先统计整个用户目录的起始占用（`userDirBefore`，别处占掉的配额也在里面），再逐 MiB 写入并立即删除单个文件，`largestFreshWriteBytes` 是一次能写进去的最大值；`overwrite` 在同一路径先写 6 MiB 再覆盖写 6 MiB，`countsOldSize` 为 `true` 说明覆盖写期间旧文件仍计入配额（首次写入就失败时为 `null`）。adapter 的文件 VFS 每次 flush 都整体覆盖库文件，这一项为 `true` 时库的实际上限只有配额的一半。

`environment.residue` 为 `true` 说明同一 JS 上下文里之前跑过引导（页面上的「重新运行」、热重载都不换上下文），`sourcesBeforePrepare` 与 `globalObject` 看到的是上次的补丁。要拿干净快照：关掉开发者工具重开，或「清缓存 → 全部清除」后重新编译，第一次自动运行的报告才算数。真机上要先把抖音从后台彻底划掉，再重新扫码预览。`environment.nativeRandom` 直接调自由变量 `crypto.getRandomValues`，不经 `tt`，用来判断平台本身有没有 Web Crypto 随机源。

## 已知会卡住的地方

已实测的（「模拟器」指抖音开发者工具，基础库 4.27–4.30；「iOS」指 iPhone 17 Pro Max / iOS 26.6.2 / 抖音 40.6.0 / 基础库 4.33.0，v6 报告）：

- **页面模块里 `globalThis` 是 `undefined`，`global` 是对象但不是真实全局对象**：`global` 上没有 `BigInt` / `Promise` / `WebAssembly` / `queueMicrotask`，而这些自由变量都能直接用。adapter 的引导（`prepare`）、能力预检与建库都经 `globalThis` 读全局，直接 `TypeError`；把 `globalThis` 垫成 `global` 也只能让 `prepare` 过，能力预检报「缺少 BigInt, queueMicrotask」。本实验的构建产物因此改为先找真实全局对象再垫（见上文 `globalThisShim`），adapter 本身未改，阶段 B 要改成按自由变量或经验证的真实全局对象检测能力。成因是模块包装函数遮蔽（**推断**），`dist-smoke.spec.ts` 的两种遮蔽模式（真实全局对象可达 / 不可达）按此复现
- **相对 wasm 路径按页面目录解析**：adapter 默认的 `wa-sqlite/wa-sqlite.wasm` 被解析成 `pages/index/wa-sqlite/wa-sqlite.wasm` 而失败，只有 `/wa-sqlite/wa-sqlite.wasm` 能用。核心实验自动改用 `wasmPath.workingPath`，阶段 B 的抖音 host 要用绝对路径
- **文件错误码与文档不符**：错误是 `name: 'API_ERROR'` 的实例，没有 `errMsg`，文案在 `message`（`accessSync:fail no such file or directory, …`）；不存在 / 已存在是 errNo 21102，readFile 缺失与写满配额是 21103，模拟器与 iOS 一致。文档里的 108xxx 只在 iOS 的 `errorCode` 上出现（模拟器是 0）。adapter VFS 按文案正则判定，`adapterErrorText` 会回落到 `message`，所以判定照样成立；不能按错误码分类
- **覆盖写时旧文件仍计入配额，库只能写到配额的一半，撞上之后库永久打不开**（模拟器与 iOS 都实测 `countsOldSize: true`；以下数字来自模拟器，iOS 的核心实验被 latin1 挡住没跑到）：裸文件一次写 10 MiB 成功、11 MiB 失败，但同一路径先写 6 MiB 再覆盖写 6 MiB 就报 `user dir saved file size limit exceeded`（errNo 21103），失败后旧文件原样保留（仍是 6 MiB）。adapter VFS 每次 flush 都整体覆盖库文件，所以库到约 5 MiB 就写不进（第 11 行，10 × 512 KiB）：同连接计数 disk I/O，关闭时报上面那条配额错误，关闭后留下 5259264 字节的库与 12304 字节的 `-journal`，重开在 PRAGMA 就 disk I/O。重开要回滚热日志、整体覆盖库文件，按这条计费规则需要 5259264 × 2 + 12304 = 10530832 字节，超过 10 MiB，**删光用户目录里其他文件也打不开**。失败的覆盖写不动旧文件，所以磁盘上的库就是上一次提交的状态（**推断**：此时删掉热日志不丢已提交数据）。这是 adapter VFS 整文件覆盖写的设计问题，阶段 B 处理；Node 替身开 `overwriteCountsOldSize` 逐项复现（`run-spike.spec.ts`）
- **iOS 一次写不进 10 MiB**：裸文件 9 MiB 成功、10 MiB 就报配额错误，起始占用是 0 个文件（模拟器 10 MiB 成功、11 MiB 失败）。差的这 1 MiB 计在哪里不知道，配额按「略小于 10 MiB」估
- **iOS 没有原生 `TextDecoder`，核心包加载即失败**：`sourcesBeforePrepare.textDecoder` 是 `polyfill`，而 polyfill 只在缺原生实现时才装。`rxdb-adapter-sqlite-core` 的 `sqlite-blank-database.ts` 在模块顶层 `new TextDecoder('latin1')`，adapter 的 polyfill 只支持 utf-8 / utf-16le，抛 `RangeError`，① ④ 全部没跑。模拟器有原生实现（`encoding` 为 `windows-1252`，正是那段代码依赖的逐字节一一映射），不受影响；`dist-smoke.spec.ts` 的无 `TextDecoder` 用例复现了这条，阶段 B 要让 polyfill 支持 latin1 或去掉顶层构造。v6 报告里 iOS 显示的是次生错误 `undefined is not an object (evaluating 'CODE_KEYS')`：`require` 吞掉了 RangeError、返回半成品导出，v7 起 `coreLoad` 直接报原始错误
- **iOS 没有 `atob` / `btoa`**：adapter VFS 自带 Base64 解码，不受影响
- **`statSync(目录, true)` 返回的 `path` 相对于被查询的目录**（`/rxdb-persistence.sqlite`），不是完整路径；Node 替身返回完整路径，两边对不上
- **`getRandomValues` 单次上限 1 MiB**：1048577 字节报 errNo 21401（`The value of 'length' is out of range`），adapter 随机池 64 KiB 不受影响

尚待真机确认的：

- **Android 的全部行为**：还没有 Android 报告
- **配额失败拿不到平台错误码**：VFS 把 `writeFileSync` 的失败吞成 `SQLITE_IOERR`，调用方只看到 `disk I/O error`（code 10），平台原文要看 `fileSystem` 的 11 MiB 探测

## 本地测试

`pnpm nx test dev-rxdb-miniprogram-douyin-spike` 用的是 [Node 测试替身](src/__tests__/fake-douyin.ts)，**不是实验证据**。错误码与文案取自抖音文档，`wasm` 用真实字节：

- `run-spike.spec.ts` 跑源码
- `dist-smoke.spec.ts` 把构建产物放进只有 ECMAScript 内置对象的 vm 上下文里跑，覆盖打包后才会出现的模块顶层问题
