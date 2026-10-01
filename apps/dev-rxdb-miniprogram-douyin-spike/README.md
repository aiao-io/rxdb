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

| 矩阵行   | 实验 | 看哪些字段                                                                                                                                                                                                                    |
| -------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WASM     | ①    | `wasmPath`：相对 / 绝对两种路径写法逐个 `compile`，`workingPath` 是可用的那个。只有 `core.persistence` 通过才判 pass，单靠 compile 成功只算 unknown                                                                           |
| 同步 FS  | ③    | `fileSystem.probes`：9 条同步调用的原始错误（`errMsg`、`errNo`、构造器）以及 adapter VFS 正则对它的判定（`vfsSaysMissing` / `vfsSaysExists`）                                                                                 |
| 随机源   | ②    | `random`：直接调 `tt.getRandomValues` 取 64 KiB、1 MiB、1 MiB+1 字节的原始结果；`prepare`：adapter 引导随机池是否成功                                                                                                         |
| 用户目录 | ④    | `core.quota`：持续写 blob 直到失败，记下失败行、错误、同连接 / 重开后的行数与 `integrity_check`。平台原始的配额文案在 `fileSystem` 的 11 MiB 探测里                                                                           |
| 持久化   | ①    | `core.persistence`：建库、写入（含中文与 emoji）、关闭、重开、读回、`integrity_check`、列出库文件                                                                                                                             |
| 版本     | ⑤    | `environment`：系统信息、基础库版本与门槛（随机源 2.87.0、WASM 2.34.0.0）、`freeGlobals`（自由变量读到的全局 `typeof`，含 `globalThis` 本身）与 `globalObject`（经 `globalThis` 按名读取），以及 `TextDecoder` 各编码能否构造 |

`coreLoad` / `core` 出现 `skipped` 时，① ④ 没跑，原因写在字符串里，其余实验照常出结果。

`globalThisShim` 记录两个包（`page` / `core`）的构建 banner：`before` 是垫之前的 `typeof globalThis`；不是对象时，banner 依次试 `sloppyThis`（非严格函数的 `this`）、`Function`（`Function('return this')()`）、`global` 三条路，每条的类型、是否真实全局对象（`isRealm`：对象字面量 `{}` 的原型就是它的 `Object.prototype`；`promiseMatchesFree` 只作旁证，抖音的包装函数换掉了自由变量 `Promise`，这一项恒为 false）、`BigInt` / `queueMicrotask` 都记在 `candidates` 里，`chosen` 是换进 `globalThis` 的那条，没有真实全局对象可用就不垫（`chosen: null`），adapter 按现状失败。垫过时，除「同步 FS」外的 findings 证据都带「前提：globalThis 垫片」后缀：那几行的 pass 说明平台能力够用，**不说明** adapter 现状可用。

`environment.residue` 为 `true` 说明同一 JS 上下文里之前跑过引导（页面上的「重新运行」、热重载都不换上下文），`sourcesBeforePrepare` 与 `globalObject` 看到的是上次的补丁。要拿干净快照：关掉开发者工具重开，或「清缓存 → 全部清除」后重新编译，第一次自动运行的报告才算数。`environment.nativeRandom` 直接调自由变量 `crypto.getRandomValues`，不经 `tt`，用来判断平台本身有没有 Web Crypto 随机源。

## 已知会卡住的地方

开发者工具模拟器（基础库 4.30.0.1）已实测的：

- **页面模块里 `globalThis` 是 `undefined`，`global` 是对象但不是真实全局对象**：`global` 上没有 `BigInt` / `Promise` / `WebAssembly` / `queueMicrotask`，而这些自由变量都能直接用。adapter 的引导（`prepare`）、能力预检与建库都经 `globalThis` 读全局，直接 `TypeError`；把 `globalThis` 垫成 `global` 也只能让 `prepare` 过，能力预检报「缺少 BigInt, queueMicrotask」。本实验的构建产物因此改为先找真实全局对象再垫（见上文 `globalThisShim`），adapter 本身未改，阶段 B 要改成按自由变量或经验证的真实全局对象检测能力。成因是模块包装函数遮蔽（**推断**），`dist-smoke.spec.ts` 的两种遮蔽模式（真实全局对象可达 / 不可达）按此复现
- **相对 wasm 路径按页面目录解析**：adapter 默认的 `wa-sqlite/wa-sqlite.wasm` 被解析成 `pages/index/wa-sqlite/wa-sqlite.wasm` 而失败，只有 `/wa-sqlite/wa-sqlite.wasm` 能用。核心实验自动改用 `wasmPath.workingPath`，阶段 B 的抖音 host 要用绝对路径
- **文件错误码与文档不符**：错误是 `name: 'API_ERROR'` 的实例，没有 `errMsg`，文案在 `message`（`accessSync:fail no such file or directory, …`）；不存在 / 已存在是 errNo 21102，readFile 缺失与写满配额是 21103，不是文档里的 108xxx。adapter VFS 按文案正则判定，`adapterErrorText` 会回落到 `message`，所以判定照样成立；不能按错误码分类
- **`getRandomValues` 单次上限 1 MiB**：1048577 字节报 errNo 21401（`The value of 'length' is out of range`），adapter 随机池 64 KiB 不受影响

尚待真机确认的：

- **没有原生 `TextDecoder('latin1')` 的设备，核心包加载即失败**：`rxdb-adapter-sqlite-core` 的 `sqlite-blank-database.ts` 在模块顶层 `new TextDecoder('latin1')`，adapter 的 polyfill 只支持 utf-8 / utf-16le，症状是 `coreLoad` 报 `RangeError`、① ④ 被跳过。模拟器有原生实现（`encoding` 为 `windows-1252`，正是那段代码依赖的逐字节一一映射），不受影响；`dist-smoke.spec.ts` 的无 `TextDecoder` 用例复现了这条
- **配额失败拿不到平台错误码**：VFS 把 `writeFileSync` 的失败吞成 `SQLITE_IOERR`，调用方只看到 `disk I/O error`（code 10），平台原文要看 `fileSystem` 的 11 MiB 探测

## 本地测试

`pnpm nx test dev-rxdb-miniprogram-douyin-spike` 用的是 [Node 测试替身](src/__tests__/fake-douyin.ts)，**不是实验证据**。错误码与文案取自抖音文档，`wasm` 用真实字节：

- `run-spike.spec.ts` 跑源码
- `dist-smoke.spec.ts` 把构建产物放进只有 ECMAScript 内置对象的 vm 上下文里跑，覆盖打包后才会出现的模块顶层问题
