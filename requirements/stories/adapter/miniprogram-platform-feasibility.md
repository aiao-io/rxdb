# 小程序平台可行性矩阵

[US-211](./US-211-multi-miniprogram-platforms.md) 阶段 A 的附件，不是新的用户故事。
阶段 B / C 只认本文件里的 `decision: supported`；`unknown` 不是可以开工的绿灯。

判定口径沿用 [US-209](./US-209-miniprogram-adapter.md) 的设计，不因平台放宽：

- wa-sqlite 在**逻辑层**、单 JavaScript realm 里同步运行。WASM 只在 Worker 里能用的平台，
  按故事约束判 `unsupported`，不在 Worker 里私自 polyfill。
- VFS 需要**同步**文件 API，异步 FS 不能冒充同步 VFS。
- 必须有可信随机源；没有文档化的安全随机 API 就不能开工，不降级到 `Math.random`。
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
      - no-documented-secure-random
      - ios-wasm-unverified
      - devtools-experiment-missing
  - id: baidu
    tier: first
    global: swan
    wasm: null
    decision: unknown
    blockers:
      - no-documented-wasm-entry
      - no-documented-secure-random
      - devtools-experiment-missing
  - id: qq
    tier: first
    global: qq
    wasm: null
    decision: unknown
    blockers:
      - no-documented-wasm-entry
      - no-documented-secure-random
      - devtools-experiment-missing
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

**阶段 B 不锁定平台。** 第一档里没有 `supported`：

| 候选顺序 | 平台   | 状态          | 进入实现前还差什么                                                                                           |
| -------- | ------ | ------------- | ------------------------------------------------------------------------------------------------------------ |
| 1        | 抖音   | `unknown`     | 开发者工具 + 真机实验：`TTWebAssembly.instantiate` 能跑通 `wa-sqlite.wasm`；逻辑层有可信随机源；iOS 同样成立 |
| 2        | QQ     | `unknown`     | 开发者工具实验：逻辑层存在路径实例化的 WASM 入口，且有可信随机源                                             |
| 3        | 百度   | `unknown`     | 同 QQ；文档里完全找不到 WASM 入口，是四个平台里最可能转 `unsupported` 的                                     |
| —        | 支付宝 | `unsupported` | 官方文档把 `MYWebAssembly` 限定在 Worker 线程，与单 realm 逻辑层设计冲突                                     |

故事里的默认候选是支付宝，现按矩阵改为抖音。阶段 B / C 被**外部环境**阻塞：
需要各平台开发者工具与真机做实验，本仓库的 CI 与 Node 测试替代不了。
实验结论回填到本文件对应行后，才能把任何平台改成 `supported`。

## 逐平台证据

每行回答 US-211 技术笔记里的六个问题：WASM 入口、同步 FS、随机源、用户目录、持久化语义、证据。

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
| WASM     | `MYWebAssembly`，基础库 2.9.7、客户端 10.5.60 起。原文：「仅支持在 Worker 线程内（如果是 iOS，需要开启实验 Worker ）使用 MYWebAssembly」。[文档](https://opendocs.alipay.com/mini/0b2bz8)、[文档源](https://raw.githubusercontent.com/AlipayDocs/open-docs/main/mini/api/MYWebAssembly.md)                                                                       |
| 同步 FS  | `my.getFileSystemManager()`，基础库 1.13.0 起，有同步方法与 `renameSync`。[文档源](https://github.com/AlipayDocs/open-docs/blob/main/mini/api/%E5%9F%BA%E7%A1%80API/%E6%96%87%E4%BB%B6/my.getFileSystemManager.md)、[FileSystemManager 概览](https://opendocs.alipay.com/mini/api/0226od)。写入上限：错误码 10028「写入文件单个超过 10M 或者写入文件夹超过 50M」 |
| 随机源   | 文档里没有安全随机 API                                                                                                                                                                                                                                                                                                                                           |
| 用户目录 | `my.env.USER_DATA_PATH`                                                                                                                                                                                                                                                                                                                                          |
| 持久化   | 有 `renameSync`；文档没有 `fsync` 与文件锁。**崩溃恢复：无**                                                                                                                                                                                                                                                                                                     |
| 判定理由 | 唯一的官方 WASM 入口只在 Worker 可用。把 RxDB 整体搬进 Worker 是另一套架构，US-211 明确不做，也不许在 Worker 里 polyfill。即使 Worker 限制解除，仍缺可信随机源                                                                                                                                                                                                   |
| 复议条件 | 支付宝在逻辑层开放 `MYWebAssembly`（或等价入口），并提供文档化的安全随机 API                                                                                                                                                                                                                                                                                     |

### 抖音 `tt` — unknown（阶段 B 第一候选）

| 问题     | 结论                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WASM     | 全局 `TTWebAssembly`，基础库 2.34.0.0 起，`compile(path)` / `instantiate(path, imports)` 只接受代码包路径；2.92.0.0 起可加载 `.wasm.br`。没写 Worker 限制，iOS 行为未说明。[文档](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/guide/experience-optimization/list/wasm)                                                                                                            |
| 同步 FS  | `tt.getFileSystemManager()` 有 `readFileSync` / `writeFileSync` / `unlinkSync` / `mkdirSync` / `renameSync`。[FileSystemManager](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/file/file-system-manager/file-system-manager)、[renameSync](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/file/file-system-manager/file-system-manager-rename-sync) |
| 随机源   | 文档里没有安全随机 API                                                                                                                                                                                                                                                                                                                                                                                       |
| 用户目录 | `tt.env.USER_DATA_PATH`（`ttfile://user`），用户文件总量约 10 MB。[tt.env](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/foundation/env/tt-env)                                                                                                                                                                                                                                 |
| 持久化   | 有 `renameSync`；文档没有 `fsync` 与文件锁。**崩溃恢复：无**                                                                                                                                                                                                                                                                                                                                                 |
| 缺的实验 | 抖音开发者工具 + Android / iOS 真机：① `TTWebAssembly.instantiate('wa-sqlite/wa-sqlite.wasm', imports)` 跑通一次读写；② 逻辑层是否存在 `crypto.getRandomValues` 或其他可信随机源；③ 记录工具与基础库版本                                                                                                                                                                                                     |

API 总览页检索不到 `TTWebAssembly`，它只出现在「体验优化」指南里。所以「总览页没有」不能当作「平台没有」。

### 百度 `swan` — unknown

| 问题     | 结论                                                                                                                                                                                                                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WASM     | 未找到。[API 总览](https://smartprogram.baidu.com/docs/develop/api/apilist/) 没有 WebAssembly；文档源仓库 [swan-team/swan-docs](https://github.com/swan-team/swan-docs) 代码检索也没有，但该仓库最后推送是 2020-04，且 GitHub 代码检索同样漏掉了支付宝仓库里确实存在的 `MYWebAssembly.md`，所以两处都不算否定证据 |
| 同步 FS  | `swan.getFileSystemManager()` 有同步方法。[文档](https://smartprogram.baidu.com/docs/develop/api/file/swan-getFileSystemManager/)                                                                                                                                                                                 |
| 随机源   | 文档里没有安全随机 API                                                                                                                                                                                                                                                                                            |
| 用户目录 | `swan.env.USER_DATA_PATH`；本地用户文件总量 10 MB（文档源 `program-docs/docs/develop/function/file_system_local.md`）                                                                                                                                                                                             |
| 持久化   | 文档没有 `fsync` 与文件锁。**崩溃恢复：无**                                                                                                                                                                                                                                                                       |
| 缺的实验 | 百度开发者工具：逻辑层 `typeof WebAssembly` / 平台前缀 WASM 全局；可信随机源；记录工具与基础库版本。确认没有 WASM 就改 `unsupported`                                                                                                                                                                              |

### QQ `qq` — unknown

| 问题     | 结论                                                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| WASM     | 未找到。[API 总览](https://q.qq.com/wiki/develop/miniprogram/API/) 没有 WebAssembly；与抖音同理，总览缺席不是否定证据                  |
| 同步 FS  | `qq.getFileSystemManager()` 有同步方法。[FileSystemManager](https://q.qq.com/wiki/develop/miniprogram/API/file/FileSystemManager.html) |
| 随机源   | 加密类只有 `getUserCryptoManager`，不是通用随机源。[文档](https://q.qq.com/wiki/develop/miniprogram/API/basic/crypto.html)             |
| 用户目录 | `qq.env.USER_DATA_PATH`                                                                                                                |
| 持久化   | 文档没有 `fsync` 与文件锁。**崩溃恢复：无**                                                                                            |
| 缺的实验 | QQ 开发者工具：逻辑层 `typeof WebAssembly` / `QQWebAssembly`；可信随机源；记录工具与基础库版本                                         |

### 观察档：京东 / 快手 / 小红书 / 企业微信 — unknown

本故事不实现，也没有做调研，只按 US-211 的档位表占位。
企业微信跑在微信运行时上，但没找到官方说明 `WXWebAssembly` 与 `wx.getRandomValues` 在企业微信里同样可用，
不能直接沿用微信行。要做另立故事。

## 维护规则

- 改 `decision` 必须同时补全该行的「实验」：工具版本、基础库版本、操作步骤、结果。只有文档链接不够。
- 某平台转 `supported` 后，才把它的 id 加进 `MINI_PROGRAM_PLATFORM_IDS` 并实现 host（阶段 B / C）。
- 某平台转 `unsupported` 后，保持它不在 `MINI_PROGRAM_PLATFORM_IDS` 里，由未知平台错误拒绝并指回本文件。
