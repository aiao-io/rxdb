# 小程序平台可行性矩阵

[US-211](./US-211-multi-miniprogram-platforms.md) 阶段 A 的附件，不是新的用户故事。
阶段 B / C 只认本文件里的 `decision: supported`；`unknown` 不是可以开工的绿灯。

判定口径沿用 [US-209](./US-209-miniprogram-adapter.md) 的设计，不因平台放宽：

- wa-sqlite 在**逻辑层**、单 JavaScript realm 里同步运行。WASM 只在 Worker 里能用的平台，
  按故事约束判 `unsupported`，不在 Worker 里私自 polyfill。
- VFS 需要**同步**文件 API，异步 FS 不能冒充同步 VFS。
- 必须有文档化的安全随机 API，不降级到 `Math.random`。没有就直接判 `unsupported`，不必等实验。
- 没有 `fsync` 与文件锁就写「崩溃恢复：无」。有原子 rename 也救不了缓冲 VFS 的整库落盘。

## 机器可读结论

```yaml
# 字段：id = MiniProgramPlatformId 候选；global = 平台全局对象（未调研为 null）；
# decision ∈ supported / unsupported / unknown；blockers 为空才可能是 supported。
platforms:
  - id: wechat
    tier: delivered
    global: wx
    wasm: WXWebAssembly
    decision: supported
    blockers: []
  - id: alipay
    tier: first
    global: my
    wasm: MYWebAssembly
    decision: unsupported
    blockers:
      - wasm-worker-only
      - no-documented-secure-random
  - id: douyin
    tier: first
    global: tt
    wasm: TTWebAssembly
    decision: unknown
    blockers:
      - ios-wasm-unverified
      - devtools-experiment-missing
  - id: baidu
    tier: first
    global: swan
    wasm: null
    decision: unsupported
    blockers:
      - no-documented-secure-random
      - no-documented-wasm-entry
  - id: qq
    tier: first
    global: qq
    wasm: null
    decision: unsupported
    blockers:
      - no-documented-secure-random
      - no-documented-wasm-entry
  - id: jd
    tier: observation
    global: null
    wasm: null
    decision: unknown
    blockers: [not-investigated]
  - id: kuaishou
    tier: observation
    global: null
    wasm: null
    decision: unknown
    blockers: [not-investigated]
  - id: xiaohongshu
    tier: observation
    global: null
    wasm: null
    decision: unknown
    blockers: [not-investigated]
  - id: wecom
    tier: observation
    global: wx
    wasm: null
    decision: unknown
    blockers: [not-investigated]
```

`MINI_PROGRAM_PLATFORM_IDS` 目前只登记 `wechat`。上表其余 id 传给适配器一律抛
`MiniProgramUnknownPlatformError`，错误信息指向本文件。

## 阶段 B 结论（AC#8）

**阶段 B 只剩抖音一个候选，而且还不是 `supported`：**

| 平台   | 状态          | 结论                                                                                                                                |
| ------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 抖音   | `unknown`     | WASM 入口、同步 FS、安全随机源、用户目录在文档里都有对应 API；还差开发者工具 + Android / iOS 真机实验（见下文抖音一节「缺的实验」） |
| QQ     | `unsupported` | 没有文档化的安全随机 API                                                                                                            |
| 百度   | `unsupported` | 没有文档化的安全随机 API，也找不到 WASM 入口                                                                                        |
| 支付宝 | `unsupported` | 官方文档把 `MYWebAssembly` 限定在 Worker 线程，与单 realm 逻辑层设计冲突                                                            |

阶段 B 被**外部环境**阻塞：抖音实验需要开发者工具、可用的小程序 AppID 与 Android / iOS 真机，
本仓库的 CI 与 Node 测试替代不了。实验结论回填到抖音一节后，才能把它改成 `supported`。

## 逐平台证据

每行回答 US-211 技术笔记里的六个问题：WASM 入口、同步 FS、随机源、用户目录、持久化语义、证据。
`unsupported` 的平台用「判定理由」与「复议条件」代替「缺的实验」。

### 微信 `wx` — supported（US-209 已交付）

| 问题     | 结论                                                                                                                                                                                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WASM     | `WXWebAssembly.instantiate(path, imports)`，只接受代码包内路径，基础库 2.13.0 起。iOS 端没有 `Global` 导出。[框架指南](https://developers.weixin.qq.com/miniprogram/dev/framework/performance/wasm.html)、[API](https://developers.weixin.qq.com/miniprogram/dev/reference/api/WXWebAssembly.html) |
| 同步 FS  | `wx.getFileSystemManager()` 提供 `readFileSync` / `writeFileSync` / `unlinkSync` / `mkdirSync` / `accessSync`。[FileSystemManager](https://developers.weixin.qq.com/miniprogram/dev/api/file/FileSystemManager.html)                                                                               |
| 随机源   | `wx.getRandomValues`，异步回调，基础库 2.15.0 起，单次上限 1 MB。[文档](https://developers.weixin.qq.com/miniprogram/dev/api/device/crypto/wx.getRandomValues.html)。`/runtime` 用它预取同步随机池                                                                                                 |
| 用户目录 | `wx.env.USER_DATA_PATH`                                                                                                                                                                                                                                                                            |
| 持久化   | 有 `renameSync`（[文档](https://developers.weixin.qq.com/miniprogram/dev/api/file/FileSystemManager.renameSync.html)）；没有 `fsync`，没有文件锁。**崩溃恢复：无**                                                                                                                                 |
| 实验     | `pnpm nx test rxdb-adapter-miniprogram`（真实 wasm + 微信文件 VFS fixture，CI 覆盖）；`pnpm nx run dev-rxdb-miniprogram-e2e:e2e-devtools`（微信开发者工具，不进 CI）。基础库下限取随机源的 2.15.0                                                                                                  |

### 支付宝 `my` — unsupported

| 问题     | 结论                                                                                                                                                                                                                                                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WASM     | `MYWebAssembly`，基础库 2.9.7、客户端 10.5.60 起。原文：「仅支持在 Worker 线程内（如果是 iOS，需要开启实验 Worker ）使用 MYWebAssembly」。[文档](https://opendocs.alipay.com/mini/0b2bz8)                                                                                                                                                                        |
| 同步 FS  | `my.getFileSystemManager()`，基础库 1.13.0 起，有同步方法与 `renameSync`。[文档源](https://github.com/AlipayDocs/open-docs/blob/main/mini/api/%E5%9F%BA%E7%A1%80API/%E6%96%87%E4%BB%B6/my.getFileSystemManager.md)、[FileSystemManager 概览](https://opendocs.alipay.com/mini/api/0226od)。写入上限：错误码 10028「写入文件单个超过 10M 或者写入文件夹超过 50M」 |
| 随机源   | 没找到文档化的安全随机 API：线上 [API 概览](https://opendocs.alipay.com/mini/api)（浏览器渲染后检索，297 个 `my.*` 条目）与[文档源仓库](https://github.com/AlipayDocs/open-docs)全文都检索不到。但两处都不收 `MYWebAssembly`，所以这条只是旁证，判定靠 WASM 一条                                                                                                 |
| 用户目录 | `my.env.USER_DATA_PATH`                                                                                                                                                                                                                                                                                                                                          |
| 持久化   | 有 `renameSync`；文档没有 `fsync` 与文件锁。**崩溃恢复：无**                                                                                                                                                                                                                                                                                                     |
| 判定理由 | 唯一的官方 WASM 入口只在 Worker 可用。把 RxDB 整体搬进 Worker 是另一套架构，US-211 明确不做，也不许在 Worker 里 polyfill。即使 Worker 限制解除，还要先找到文档化的可信随机源                                                                                                                                                                                     |
| 复议条件 | 支付宝在逻辑层开放 `MYWebAssembly`（或等价入口），并提供文档化的安全随机 API                                                                                                                                                                                                                                                                                     |

### 抖音 `tt` — unknown（阶段 B 唯一候选）

| 问题     | 结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WASM     | 全局 `TTWebAssembly`，基础库 2.34.0.0 起，`compile(path)` / `instantiate(path, imports)` 只接受代码包内路径；2.92.0.0 起可加载 `.wasm.br`。没写 Worker 限制，iOS 行为未说明。[文档](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/tutorial/experience-optimization/list/wasm)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 同步 FS  | `tt.getFileSystemManager()` 的同步方法覆盖 VFS 用到的全部调用：`accessSync`、`readFileSync(path, 'base64')`、`writeFileSync(path, ArrayBuffer)`、`unlinkSync`、`mkdirSync(path, recursive)`（`recursive` 从基础库 1.81.0 起），另有 `renameSync`。写文件、建目录的路径必须以 `ttfile://user` 开头。文档列出的错误文案 `no such file or directory`、`file already exists` 能被 VFS 现有的错误分类正则接住（**推断**，实验 ③ 用真机原文确认）。[FileSystemManager](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/file/file-system-manager/file-system-manager)、[readFileSync](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/file/file-system-manager/file-system-manager-read-file-sync)、[mkdirSync](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/file/file-system-manager/file-system-manager-mkdir-sync)、[renameSync](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/file/file-system-manager/file-system-manager-rename-sync) |
| 随机源   | `tt.getRandomValues`，原文「获取安全学密码随机数」，异步方法；调用形状与 `wx.getRandomValues` 一致（`{ length, success, fail }`，结果取 `randomValues` ArrayBuffer），`length` 取 1～1048576 从基础库 2.87.0 起。[文档](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/device/crypto/tt-get-random-valus)。单次上限正好等于同步随机池上限 `MAX_MINI_PROGRAM_RANDOM_POOL_SIZE`（1 MiB）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 用户目录 | `tt.env.USER_DATA_PATH`（`ttfile://user`）。原文「每个小程序的用户目录存储上限为 10M」，数据库文件与 `-journal` 共用这份配额；超限时 `writeFileSync` 报 108403「user dir saved file size limit exceeded」。[tt.env](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/foundation/env/tt-env)、[writeFileSync](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/file/file-system-manager/file-system-manager-write-file-sync)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 持久化   | 有 `renameSync`；文档没有 `fsync` 与文件锁。**崩溃恢复：无**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 缺的实验 | 抖音开发者工具 + Android / iOS 真机，用真实 VFS 与 `wa-sqlite.wasm` 做一次性 spike：① `TTWebAssembly.instantiate` 后建库、写入、关闭、重开、读回；② `tt.getRandomValues` 取 64 KiB 与 1 MiB 各一次；③ 记录 errMsg 原文：文件不存在（`accessSync` / `unlinkSync`）、目录已存在（`mkdirSync`）、配额写满（`writeFileSync`）；④ 库接近 10 MB 时的失败形态；⑤ 记录工具、基础库与客户端版本，基础库下限按 2.87.0 验证（WASM 要 2.34.0.0，随机源的参数约束与返回值从 2.87.0 起才有文档）。前置：可用的抖音小程序 AppID 与两端真机                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

API 总览页检索不到 `TTWebAssembly`，它只出现在「体验优化」指南里。所以「总览页没有」不能当作「平台没有」。

### 百度 `swan` — unsupported

| 问题     | 结论                                                                                                                                                                                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WASM     | 未找到。线上 [API 列表](https://smartprogram.baidu.com/docs/develop/api/apilist/)（浏览器渲染后全文检索，276 处 `swan.*`）与文档源仓库 [swan-team/swan-docs](https://github.com/swan-team/swan-docs) 全文都没有 WebAssembly。抖音的 WASM 入口同样不在 API 总览里，源仓库也已停更，所以这条只是旁证 |
| 同步 FS  | `swan.getFileSystemManager()` 有同步方法。[文档](https://smartprogram.baidu.com/docs/develop/api/file/swan-getFileSystemManager/)                                                                                                                                                                  |
| 随机源   | 没有文档化的安全随机 API。线上 API 列表检索不到随机数类 API，沾「加密」的只有风控用的 `swan.getSystemRiskInfo`；文档源仓库全文只有一段示例代码，在 `crypto.getRandomValues` 不存在时退回 `Math.random`                                                                                             |
| 用户目录 | `swan.env.USER_DATA_PATH`；本地用户文件总量 10 MB（文档源 `program-docs/docs/develop/function/file_system_local.md`）                                                                                                                                                                              |
| 持久化   | 文档没有 `fsync` 与文件锁。**崩溃恢复：无**                                                                                                                                                                                                                                                        |
| 判定理由 | 缺可信随机源，按判定口径直接判 `unsupported`，不降级到 `Math.random`，也不必等实验。WASM 入口找不到是第二个缺口，单凭它不够判定                                                                                                                                                                    |
| 复议条件 | 百度提供文档化的安全随机 API，**且**逻辑层有能按代码包内路径实例化的 WASM 入口。复议时补开发者工具 + 真机实验                                                                                                                                                                                      |

### QQ `qq` — unsupported

| 问题     | 结论                                                                                                                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WASM     | 未找到。线上 [API 总览](https://q.qq.com/wiki/develop/miniprogram/API/)（浏览器渲染后全文检索，288 处 `qq.*`）没有 WebAssembly；与抖音同理，总览缺席只是旁证                                                                                                |
| 同步 FS  | `qq.getFileSystemManager()` 有同步方法。[FileSystemManager](https://q.qq.com/wiki/develop/miniprogram/API/file/FileSystemManager.html)                                                                                                                      |
| 随机源   | 没有文档化的安全随机 API。[加密](https://q.qq.com/wiki/develop/miniprogram/API/basic/crypto.html)一页只有 `qq.getUserCryptoManager` 与 `UserCryptoManager.getLatestUserKey`（取用户维度的通信密钥），没有 `getRandomValues`；API 总览也检索不到随机数类 API |
| 用户目录 | `qq.env.USER_DATA_PATH`                                                                                                                                                                                                                                     |
| 持久化   | 文档没有 `fsync` 与文件锁。**崩溃恢复：无**                                                                                                                                                                                                                 |
| 判定理由 | 缺可信随机源，按判定口径直接判 `unsupported`。WASM 入口找不到是第二个缺口                                                                                                                                                                                   |
| 复议条件 | QQ 提供文档化的安全随机 API，**且**逻辑层有能按代码包内路径实例化的 WASM 入口。复议时补开发者工具 + 真机实验                                                                                                                                                |

### 观察档：京东 / 快手 / 小红书 / 企业微信 — unknown

本故事不实现，也没有做调研，只按 US-211 的档位表占位。
企业微信跑在微信运行时上，但没找到官方说明 `WXWebAssembly` 与 `wx.getRandomValues` 在企业微信里同样可用，
不能直接沿用微信行。要做另立故事。

## 维护规则

- 改判 `supported` 必须补全该平台的「实验」：工具版本、基础库与客户端版本、操作步骤、结果。只有文档链接不够。
- 判 `unsupported` 可以只凭文档：写明缺的是判定口径里哪项硬依赖、怎么检索的，再补「判定理由」与「复议条件」。
- 某平台转 `supported` 后，才把它的 id 加进 `MINI_PROGRAM_PLATFORM_IDS` 并实现 host（阶段 B / C）。
- 某平台转 `unsupported` 后，保持它不在 `MINI_PROGRAM_PLATFORM_IDS` 里，由未知平台错误拒绝并指回本文件。
