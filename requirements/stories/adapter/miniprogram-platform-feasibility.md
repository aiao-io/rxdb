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
# decision ∈ supported / unsupported / unknown；blockers 为空才可能是 supported；
# caveats = supported 平台仍未验证的范围，逐条写进 US-211 AC#14 与兼容文档。
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
    decision: supported
    blockers: []
    caveats:
      - android-unverified
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

`MINI_PROGRAM_PLATFORM_IDS` 登记了 `wechat` 与 `douyin`。上表其余 id 传给适配器一律抛
`MiniProgramUnknownPlatformError`，错误信息指向本文件。

## 阶段 B 结论（AC#8）

**阶段 B 交付抖音，带一条 caveat：Android 真机未验证。**

| 平台   | 状态          | 结论                                                                                                       |
| ------ | ------------- | ---------------------------------------------------------------------------------------------------------- |
| 抖音   | `supported`   | 开发者工具模拟器与 iOS 真机的 v9 实验 5 项全 pass（见下文抖音一节「实验」）；Android 真机未跑，记为 caveat |
| QQ     | `unsupported` | 没有文档化的安全随机 API                                                                                   |
| 百度   | `unsupported` | 没有文档化的安全随机 API，也找不到 WASM 入口                                                               |
| 支付宝 | `unsupported` | 官方文档把 `MYWebAssembly` 限定在 Worker 线程，与单 realm 逻辑层设计冲突                                   |

抖音的对外口径是「实验性支持」：Android 真机补跑一份 v9 报告并全 pass 后，才去掉 `android-unverified`。

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

### 抖音 `tt` — supported（阶段 B 交付，Android 未验证）

| 问题     | 结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WASM     | 全局 `TTWebAssembly`，基础库 2.34.0.0 起，`compile(path)` / `instantiate(path, imports)` 只接受代码包内路径；2.92.0.0 起可加载 `.wasm.br`。没写 Worker 限制，iOS 行为未说明。[文档](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/tutorial/experience-optimization/list/wasm)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 同步 FS  | `tt.getFileSystemManager()` 的同步方法覆盖 VFS 用到的全部调用：`accessSync`、`readFileSync(path, 'base64')`、`writeFileSync(path, ArrayBuffer)`、`unlinkSync`、`mkdirSync(path, recursive)`（`recursive` 从基础库 1.81.0 起），另有 `renameSync`。写文件、建目录的路径必须以 `ttfile://user` 开头。实测错误是 `name: 'API_ERROR'` 的实例，没有 `errMsg`，文案在 `message`（如 `accessSync:fail no such file or directory, …`）；不存在 / 已存在的 errNo 是 21102，readFile 缺失与写满配额都是 21103（模拟器与 iOS 一致），文档里的 108xxx 只出现在 iOS 的 `errorCode` 上。所以 VFS 只按文案分类，不按错误码。[FileSystemManager](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/file/file-system-manager/file-system-manager)、[readFileSync](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/file/file-system-manager/file-system-manager-read-file-sync)、[mkdirSync](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/file/file-system-manager/file-system-manager-mkdir-sync)、[renameSync](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/file/file-system-manager/file-system-manager-rename-sync) |
| 随机源   | `tt.getRandomValues`，原文「获取安全学密码随机数」，异步方法；调用形状与 `wx.getRandomValues` 一致（`{ length, success, fail }`，结果取 `randomValues` ArrayBuffer），`length` 取 1～1048576 从基础库 2.87.0 起。[文档](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/device/crypto/tt-get-random-valus)。单次上限正好等于同步随机池上限 `MAX_MINI_PROGRAM_RANDOM_POOL_SIZE`（1 MiB）。实测 64 KiB、1 MiB 成功，超上限报 `getRandomValues:fail The value of 'length' is out of range. It must be > 0 && <= 1048576.`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 用户目录 | `tt.getEnvInfoSync().common.USER_DATA_PATH`（`ttfile://user`，基础库 2.21.0 起）。实验 v9 读的是 `tt.env.USER_DATA_PATH`，开发者工具对它报「即将弃用，请使用 `tt.getEnvInfoSync`」，正式 host 已改走 `getEnvInfoSync`，Taro tt demo 页面加载时预检会读用户目录，开发者工具不再报这条警告。原文「每个小程序的用户目录存储上限为 10M」，数据库文件、`-journal` 与回滚余量共用这份配额。实测：裸文件一次写入模拟器 10 MiB 成功、11 MiB 失败，iOS 9 MiB 成功、10 MiB 失败，配额按「略小于 10 MiB」估；**覆盖写时旧文件仍计入配额**（两端一致），失败后旧文件原样保留；超限原文 `writeFileSync:fail user dir saved file size limit exceeded`（iOS errorCode 108403）。[tt.getEnvInfoSync](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/foundation/env/get-env-info-sync)、[tt.env](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/foundation/env/tt-env)、[writeFileSync](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/file/file-system-manager/file-system-manager-write-file-sync)                                                                                                                                               |
| 持久化   | 有 `renameSync`；文档没有 `fsync` 与文件锁。**崩溃恢复：无**。因为覆盖写计旧文件，单文件布局下库到约 5 MiB 就写不进，撞上后回滚热日志要约 2 × 库大小，库永久打不开（模拟器 v6 实测）。抖音 host 因此声明分块布局：库存成 64 KiB 的 `P.0`、`P.1`…，flush 只覆盖脏块；每个库另占 2 × 块大小的回滚余量（`<库>.rxdb-reserve`），撞配额时先让出余量再报 `SQLITE_FULL`（13），平台原文挂在 `cause` 链上                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 实验     | `apps/dev-rxdb-miniprogram-douyin-spike`，报告 schema `aiao.us-211.douyin-spike/v9`，跑的是 adapter 正式代码（无垫片）：① 建库、写入、关闭、重开、读回；② 随机源 64 KiB / 1 MiB / 超上限；③ 9 条同步 FS 探测的错误原文；④ 写到撞配额后不清理直接重开；⑤ 版本与门槛。**开发者工具模拟器**（基础库 4.27.0，2026-10-02，重建后首轮；工具自身版本报告没采集）与 **iOS 真机**（iPhone 17 Pro Max / iOS 26.6.2 / 抖音 40.6.0 / 基础库 4.33.0，2026-10-02，后台划掉后重扫）5 项全 pass：两端都在写第 20 行（块 `.155`）时撞配额，`SQLITE_FULL` + 平台原文；重开后 19 / 19 行、`integrity_check` ok、块号 0..152 连续。**Android 真机未跑**（caveat `android-unverified`）。基础库下限 2.87.0 取自文档（随机源参数约束从这版起才有），实测只覆盖 4.27.0 与 4.33.0                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

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
- `blockers` 为空才可能 `supported`；`supported` 但没验证完的范围写进 `caveats`，每一条都必须在 US-211 AC#14 与
  `website/docs/compatibility.md` 里逐条写出，补完实验后再删。
- 判 `unsupported` 可以只凭文档：写明缺的是判定口径里哪项硬依赖、怎么检索的，再补「判定理由」与「复议条件」。
- 某平台转 `supported` 后，才把它的 id 加进 `MINI_PROGRAM_PLATFORM_IDS` 并实现 host（阶段 B / C）。
- 某平台转 `unsupported` 后，保持它不在 `MINI_PROGRAM_PLATFORM_IDS` 里，由未知平台错误拒绝并指回本文件。
