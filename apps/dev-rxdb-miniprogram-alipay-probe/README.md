# 支付宝小程序探针（US-211 阶段 C 验证实验）

一个打开即跑的支付宝小程序，用实验核对 [可行性矩阵](../../requirements/stories/adapter/miniprogram-platform-feasibility.md) 支付宝一节的阻断项（`wasm-worker-only`、`no-documented-secure-random`），并且像 [抖音 spike](../dev-rxdb-miniprogram-douyin-spike/README.md) 一样把 adapter 真正跑一遍：建库、写入、重开、写到撞配额。产出一份 JSON 报告用于回填矩阵。

支付宝已判 `unsupported`，不在 `MINI_PROGRAM_PLATFORM_IDS` 里。实验 host `createAlipayProbeHost`（[alipay-host.ts](src/alipay-host.ts)）借 `wechat` 平台 id 才能交给 adapter 的公开 API，并补上平台缺的两块：

- **FS 包装层**（[alipay-fs.ts](src/alipay-fs.ts)）：平台失败时返回错误对象、不抛，包装层把它转成抛错，把错误码归一成 adapter VFS 正则认得的英文文案，平台原文挂在 `cause` 上；写入一律走「base64 串 + `'base64'`」，只有这种写法两端字节都一致
- **Worker 随机源**（[worker-protocol.ts](src/worker-protocol.ts)）：逻辑层没有任何随机源，随机数从 Worker 的 `crypto.getRandomValues` 桥过来

这两块都依赖未文档化的行为，所以报告的 pass 只说明「照这个形态写正式 host 可行」，**不说明** adapter 现状支持支付宝。

## 跑一次

1. 构建：`pnpm nx build dev-rxdb-miniprogram-alipay-probe`，产物在本目录的 `dist/`
2. 打开 `dist/`（**不是**本目录，本目录是源码，打开会报 ENOENT），两种方式任选：
   - 小程序开发者工具 →「打开项目」→ 选 `dist/`
   - 命令行：`open "antdevtool-tiny://open?path=$(python3 -c 'import urllib.parse,os;print(urllib.parse.quote(os.path.abspath("apps/dev-rxdb-miniprogram-alipay-probe/dist")))')"`，工具弹出预填好的「打开项目」，点「完 成」
3. 首次打开会问是否信任该文件夹，选「我信任该文件夹」
4. 页面打开就自动跑，配额实验要写几十 MiB，等状态变成「完成」
5. 点「复制报告」，或在控制台搜 `[alipay-probe] 报告`
6. 真机调试、预览都要关联真实 AppID（在工具里改，别提交进 `static/`），模拟器不需要
7. 模拟器、iOS 真机调试、iOS 预览、Android **各跑一份**，单份只代表那一台设备的那一次运行

## 模拟器自动化

`pnpm nx run dev-rxdb-miniprogram-alipay-probe-e2e:e2e-devtools`：经 CDP 驱动 GUI 版开发者工具，用工具栏的编译开关先「停止编译」再「启动编译」，从磁盘重读 `dist/`，等新一轮报告，逐条断言模拟器上的事实（[simulator-probe.spec.ts](../dev-rxdb-miniprogram-alipay-probe-e2e/src/simulator-probe.spec.ts)）。前提是开发者工具已经打开 `dist/`。不进 CI。

- CDP 端点：IDE 把端口写在 `~/Library/Application Support/小程序开发者工具/DevToolsActivePort`，也可以用 `ALIPAY_DEVTOOLS_WS_ENDPOINT` 直接给 ws 地址。`--remote-debugging-port` 被 IDE 忽略，`/json/*` HTTP 发现被 Host 头校验拦
- 编译开关是 `[data-toolbar-action-id="simulator-toolbar-start"]`，要用 `Input.dispatchMouseEvent` 点；「普通编译」只是编译模式下拉里的选项，点了不编译
- 模拟器是 `webview` target（标题 `Lyra Simulator`），Playwright 不把它当 page 暴露，所以用的是自带的极简 CDP 客户端
- 一轮约 2 分钟（核心实验跑通后，两个配额实验各写几十 MiB）。有断言红了，Playwright 会换 worker 重跑 `beforeAll`，等于再跑一轮
- 跑之前别在 IDE 里调试：模拟器调试器停在断点上时 `Runtime.evaluate` 永远不回，客户端每条命令 30 秒超时，报错会提示这一点
- 每轮报告原样落盘到 `dev-rxdb-miniprogram-alipay-probe-e2e/test-output/simulator-report.json`
- 真机没有自动化通道：支付宝没有公开的真机自动化 SDK，真机报告只能手动复制

## 报告怎么读（`schema: 'aiao.us-211.alipay-probe/v3'`）

`findings` 是按矩阵行给出的本次判定（pass / fail / unknown），证据在它引用的字段里：

| 矩阵行   | 看哪些字段                                                                                                                                                                                                                                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WASM     | `wasm`：逻辑层标准 `WebAssembly` 实例化 `wasm/add.wasm` 的结果，`codePackageBinary` 对比代码包二进制读与 base64 文本副本；`worker.value.MYWebAssembly`：Worker 里文档化的入口。只有核心实验经 adapter 实例化 wa-sqlite 成功才判 pass                                                                                                          |
| 同步 FS  | `fileSystem.probes`：交给 adapter 的那层 FS（包装层 + 分帧层）上的同步调用与 adapter VFS 预期逐条对照（`asExpected`），矩阵按它判；`rawFs`：不经包装层，四种写入方式（`arrayBuffer`、带 `'binary'`、base64 串配 `'base64'`、`typedArray`）的写入 / 读回字节，外加空写入（`emptyWrite`）与写到不存在的父目录（`missingParentWrite`）的原始返回 |
| 随机源   | `random`：逻辑层 `my.getRandomValues`、`crypto` 与 Worker 桥过来的原始结果；`prepare`：adapter 引导随机池是否成功                                                                                                                                                                                                                             |
| 用户目录 | `core.quota`：经 SQLite 写到撞配额，失败错误、重开后行数与 `integrity_check`；`quotaAccounting`：不经 SQLite 用裸文件测文档的 10028「单个超过 10M 或者文件夹超过 50M」——单文件能写多大（`largestSingleWriteBytes`），文件夹上限算在哪一级（`fill.scope`）                                                                                     |
| 持久化   | `core.persistence`：建库、写入、关闭、重开、读回、`integrity_check`、列出库文件                                                                                                                                                                                                                                                               |

其余字段：

- `environment`：`systemInfo`、基础库版本、`USER_DATA_PATH`、`freeGlobals`（自由变量读到的全局 `typeof`）、`canIUse`
- `realmProbe`：页面包与核心包构建 banner 找真实全局对象的记录，四条候选路 `sloppyThis` / `Function` / `global` / `objectPrototypeGetter` 的结果都在 `candidates` 里，`chosen` 是选中的那条，经 `host.runtimeGlobal` 交给 adapter。判据与抖音 spike 相同。`objectPrototypeGetter` 在 `Object.prototype` 上临时挂一个返回 `this` 的 getter、以自由变量读它，读完即删——自由变量查到全局对象的原型链上，getter 的 `this` 就是真实全局对象
- `runtimeRepairs`：引导前实验 host 往真实全局对象上补的全局。缺 `BigInt` 时从 wasm 的 i64 返回值取回原生构造器（`Object(value).constructor`），缺 `queueMicrotask` 时用 `Promise` 排微任务；已有的不动，`BigInt` 取不回就什么都不装
- `coreLoad` / `core`：核心包由页面在 `prepare` 之后懒 `require`。`skipped` 时原因写在字符串里，其余实验照常出结果
- `environment.residue` 为 `true` 说明同一 JS 上下文里之前跑过引导，快照不是平台原生状态；要重新编译（真机要把支付宝从后台划掉）再跑

## 构建细节

- esbuild 从源码打三个包：页面包 `pages/index/index.js`、核心包 `probe-core.js`、Worker 包 `workers/index.js`。直接打源码，不依赖上游 build
- **IDE 编译器只认到 es2018**：更新的语法会编译失败，症状是模拟器里没有逻辑层 frame
- **Worker 包要自己降到 ES5**：IDE 对 Worker 走 babel + core-js 转译，注入的 polyfill 依赖 `Function('return this')()`，在 Worker 里拿不到全局对象，Worker 一启动就崩。构建用 swc 把 Worker 降到 ES5，`mini.project.json` 用 `compileOptions.transpile.script.ignore: ["workers/**"]` 让 IDE 跳过它

## 已知会卡住的地方

已实测（2026-10-03）：小程序开发者工具 3.10.15 模拟器（基础库 2.10.15），v2、v3 与加了三处绕行之后的 v3 报告；iOS 真机调试（iOS 26.6.2 / 支付宝 12.12.30 / 基础库 2.10.42），v2 报告。

| 现象                                 | 模拟器                                                                                                     | iOS 真机调试                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 逻辑层 `MYWebAssembly`               | 没有                                                                                                       | 没有                                                                        |
| 逻辑层标准 `WebAssembly`（未文档化） | 能用，`add(2, 3) === 5`                                                                                    | **也能用**，`add(2, 3) === 5`                                               |
| Worker 里的 `my` / FS                | 没有                                                                                                       | 没有（JSC 报 `Can't find variable: my`）                                    |
| Worker 里的 `crypto.getRandomValues` | 有（未文档化）                                                                                             | 有（未文档化）                                                              |
| 逻辑层 `globalThis` / `BigInt`       | 都没有；非严格函数的 `this` 也是 `undefined`，`Function('return this')()` 是别的 realm                     | 都有                                                                        |
| 写 `ArrayBuffer`                     | 落盘成 base64 文本，9 字节变 12 字节                                                                       | 原样 9 字节                                                                 |
| 写 `Uint8Array`                      | 报 90000                                                                                                   | **返回 `success`，落盘 0 字节**                                             |
| `renameSync` 到已存在的目标          | 报 10025                                                                                                   | 直接覆盖                                                                    |
| 写空文件（v3）                       | **报 error 2「接口参数无效」**，adapter 建库第一步就失败                                                   | v3 未跑；v2 里写 `Uint8Array` 落成 0 字节文件也返回 `success`，**推断**能写 |
| 写到父目录不存在的路径（v3）         | 照样写成，不报 10022                                                                                       | v3 未跑                                                                     |
| 读代码包里的二进制文件               | **当 UTF-8 文本读**，非法序列变成 `EF BF BD`：wa-sqlite.wasm 727646 字节读回 814795 字节，传什么编码都一样 | 未测；v3 的 `wasm.codePackageBinary` 会记录                                 |
| 代码包路径写法                       | 只认相对路径；`/wasm/add.wasm`、`./…` 报 error 2「无效参数」，`copyFileSync` / `statSync` 也一样           | v2：相对路径可读                                                            |

两端共同的：

- **FS 失败返回错误对象，不抛**：`{ error: 10022, errorMessage }` 这类对象要自己判断。iOS 多一个 `message` 字段，文案与模拟器不同
- **没有 `openSync` / `readSync` / `writeSync` / `truncateSync`**：只有整文件读写
- **逻辑层拿不到任何随机源**：`my.getRandomValues` 不存在，`canIUse` 为 `false`，也没有 `crypto`
- **逻辑层没有 `queueMicrotask`**：adapter 的能力预检把它列为硬依赖。按 v2 的 iOS 形态推演（`dist-smoke.spec.ts`），即使全局对象和 `BigInt` 都在，adapter 也会在打开库之前拒绝，报「缺少 RxDB 必需能力: queueMicrotask」；对照组补上它之后全部实验跑通
- **读回的 `ArrayBuffer` 可能来自别的 realm**：`instanceof ArrayBuffer` 不可靠，探针改用 `Object.prototype.toString` 判断

模拟器 v3 最初的结果（四轮逐字段一致）：`prepare` 拿不到真实全局对象，核心包模块顶层撞上 `BigInt is not defined`，adapter 一步都没跑。

实验 host 加了三处绕行之后，**adapter 在模拟器上跑通了**（e2e 实测，约 122 秒一轮）：

1. **全局对象**：banner 的 `objectPrototypeGetter` 拿到真实全局对象；`runtimeRepairs` 在它上面补了 `BigInt` 与 `queueMicrotask`
2. **空写入**：用户文件经分帧层（`frameUserFiles`）写，每个文件前垫 1 字节头，读与 stat 时剥掉，adapter 建库要写的空文件也有 1 字节可写
3. **代码包二进制被改写**：构建在每个 `.wasm` 旁边放一份 `.base64.txt` 文本副本，实验 host 的 wasm 运行时读副本再 `my.base64ToArrayBuffer`；base64 只含 ASCII，读回原样。后缀用 `.txt` 是押真机代码包的文件类型白名单放行文本（**未实测**）

findings：WASM pass、同步 FS pass（包装层 + 分帧层 9 条探测全部符合 VFS 预期；裸 FS 照实记着空写入 error 2、写到不存在的父目录照样成功、裸写只有 base64 串字节一致——adapter VFS 打开时先建根目录、库文件平铺其下，不会写进不存在的目录）、随机源 pass（经 Worker 桥接）、用户目录 unknown（写 120 × 512 KiB 没撞配额）、持久化 pass（关闭重开 3 行逐字一致，integrity ok）。这三处绕行都是实验 host 的做法，adapter 正式支持支付宝时要换成正式实现。

配额（模拟器 v3）：

- **单文件 7 MiB 写得进，8 MiB 报 10028「单个文件超限」**。文档写的是 10M，**推断**平台按 base64 串长计费：7 MiB 编码后约 9.3 MiB，8 MiB 约 10.7 MiB，正好卡在 10 MiB 两侧
- **文件夹没撞到 50M 上限**：写了 11 个 7 MiB 文件共 77 MiB 都成功（`fill.scope: null`）。真机上是否有这条限制未验证

`globalObjectMode`（IDE schema 里有、文档没有的 `mini.project.json` 字段）试过三个值，都不改变逻辑层没有 `globalThis` / `BigInt` 的事实：`enable` 没效果，`fake` 让模拟器崩了一次（没复现），`legacy` 没测完。IDE 会提示「globalObjectMode 可能是不支持的属性」。探针不用它。

模拟器的全局能力与 FS 字节语义都和真机不一样，凡是涉及这两类的结论都以真机为准。

尚待确认的：

- **iOS 上的 v3**：v3（adapter 全流程、配额计费）还没在真机上跑过；真机调试与预览两种模式都要跑，v2 只跑了真机调试
- **Android 真机**：还没跑
- **预览模式下逻辑层的 `WebAssembly`**：v2 的 iOS 报告是接着调试器跑的

## 本地测试

`pnpm nx test dev-rxdb-miniprogram-alipay-probe` 用的是 [Node 测试替身](src/__tests__/fake-alipay.ts)，**不是实验证据**。替身按实测建了 iOS 与模拟器两种 FS 形态：

- `run-probe.spec.ts` 跑源码：两种形态都经分帧层与 wasm 文本副本跑通全部实验；模拟器形态的代码包二进制读按实测改写成 UTF-8 文本
- `dist-smoke.spec.ts` 把构建产物放进只有 ECMAScript 内置对象的 vm 上下文里跑，复现两端的全局形态：iOS 形态实验 host 补上 `queueMicrotask` 后跑通；模拟器形态 `objectPrototypeGetter` 找回全局对象、补上 `BigInt` 与 `queueMicrotask` 后跑通；另外检查 Worker 包是 ES5、IDE 跳过它的配置在产物里、wasm 文本副本与原文件逐字节一致
- `vfs-classifiers.spec.ts` 逐字比对 adapter VFS 里的缺失 / 已存在 / 配额正则，免得报告里的判定与 adapter 实际判定脱节
