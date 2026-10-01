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

| 矩阵行   | 实验 | 看哪些字段                                                                                                                                              |
| -------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WASM     | ①    | `wasmPath`：相对 / 绝对两种路径写法逐个 `compile`，`workingPath` 是可用的那个。只有 `core.persistence` 通过才判 pass，单靠 compile 成功只算 unknown     |
| 同步 FS  | ③    | `fileSystem.probes`：9 条同步调用的原始错误（`errMsg`、`errNo`、构造器）以及 adapter VFS 正则对它的判定（`vfsSaysMissing` / `vfsSaysExists`）           |
| 随机源   | ②    | `random`：直接调 `tt.getRandomValues` 取 64 KiB、1 MiB、1 MiB+1 字节的原始结果；`prepare`：adapter 引导随机池是否成功                                   |
| 用户目录 | ④    | `core.quota`：持续写 blob 直到失败，记下失败行、错误、同连接 / 重开后的行数与 `integrity_check`。平台原始的 108403 文案在 `fileSystem` 的 11 MiB 探测里 |
| 持久化   | ①    | `core.persistence`：建库、写入（含中文与 emoji）、关闭、重开、读回、`integrity_check`、列出库文件                                                       |
| 版本     | ⑤    | `environment`：系统信息、基础库版本与门槛（随机源 2.87.0、WASM 2.34.0.0）、全局能力的 `typeof`、`TextDecoder` 各编码能否构造                            |

`coreLoad` / `core` 出现 `skipped` 时，① ④ 没跑，原因写在字符串里，其余实验照常出结果。

## 已知会卡住的地方

- **没有原生 `TextDecoder('latin1')` 的设备，核心包加载即失败**：`rxdb-adapter-sqlite-core` 的 `sqlite-blank-database.ts` 在模块顶层 `new TextDecoder('latin1')`，而 adapter 的 polyfill 只支持 utf-8 / utf-16le。症状是 `coreLoad` 报 `RangeError: 不支持的 TextDecoder 编码: latin1`，① ④ 被跳过。`dist-smoke.spec.ts` 在无 `TextDecoder` 的 vm 上下文里复现了这一点
- **`queueMicrotask`**：adapter 把它列为 RxDB 必需能力，自己不补。抖音文档没写有没有，看 `environment.globals.queueMicrotask` 与 `core.capabilities`
- **配额失败拿不到平台错误码**：VFS 把 `writeFileSync` 的 108403 吞成 `SQLITE_IOERR`，调用方只看到 `disk I/O error`（code 10）。所以 `core.quota.failure` 里没有 108403，平台原文要看 `fileSystem` 的 11 MiB 探测

## 本地测试

`pnpm nx test dev-rxdb-miniprogram-douyin-spike` 用的是 [Node 测试替身](src/__tests__/fake-douyin.ts)，**不是实验证据**。错误码与文案取自抖音文档，`wasm` 用真实字节：

- `run-spike.spec.ts` 跑源码
- `dist-smoke.spec.ts` 把构建产物放进只有 ECMAScript 内置对象的 vm 上下文里跑，覆盖打包后才会出现的模块顶层问题
