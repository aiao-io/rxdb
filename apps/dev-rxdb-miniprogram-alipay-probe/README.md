# 支付宝小程序探针（US-211 阶段 C 验证实验）

一个打开即跑的支付宝小程序，用实验核对 [可行性矩阵](../../requirements/stories/adapter/miniprogram-platform-feasibility.md) 支付宝一节的阻断项（`wasm-worker-only`、`no-documented-secure-random`），产出一份 JSON 报告用于回填矩阵「实验」一行。

不依赖 adapter，也不需要构建：纯静态 `my.*` 调用，目录本身就是小程序项目。支付宝已判 `unsupported`，探针只负责回答「文档说的限制在运行时是不是真的」。

## 跑一次

1. 打开项目，两种方式任选：
   - 小程序开发者工具 →「打开项目」→ 选本目录
   - 命令行：`open "antdevtool-tiny://open?path=$(python3 -c 'import urllib.parse,os;print(urllib.parse.quote(os.path.abspath("apps/dev-rxdb-miniprogram-alipay-probe")))')"`，工具弹出预填好的「打开项目」，点「完 成」
2. 首次打开会问是否信任该文件夹，选「我信任该文件夹」
3. 页面打开就自动跑，状态变成「完成」即可
4. 点「复制报告」，或在控制台搜 `[alipay-probe] 报告`
5. 真机预览要在 `mini.project.json` 关联真实 AppID（别提交进仓库），模拟器不需要

## 报告怎么读（`probe: 'alipay-probe v2'`）

| 字段          | 内容                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `environment` | `systemInfo`、基础库 `SDKVersion`、`USER_DATA_PATH`；`freeGlobals` 是逻辑层直接引用各全局名的 `typeof`（未声明时记 `throws: ReferenceError`）；`sloppyThis` 是非严格函数的 `this`；`canIUse` 逐项探 API |
| `wasm`        | 逻辑层的 `MYWebAssembly` 与 `WebAssembly`：存在性，以及用 `/wasm/add.wasm` 实例化后 `add(2, 3)` 的结果                                                                                                  |
| `worker`      | `my.createWorker('workers/index.js', { useExperimentalWorker: true })` 是否创建成功；`outcome` 是 Worker 回传的同一组探测（`MYWebAssembly` / `WebAssembly` / `my` / FS / `crypto.getRandomValues`）     |
| `random`      | `my` 的全部成员（`myMembers`）及名字像随机源的候选（`suspicious`）、`my.getRandomValues`、逻辑层 `crypto.getRandomValues`                                                                               |
| `fileSystem`  | `methods`：同步方法逐个是否存在；`steps`：错误路径与正常路径的原始返回值；`roundTrip`：四种写入方式（`ArrayBuffer`、带 `'binary'`、base64 串配 `'base64'`、`Uint8Array`）的写入 / `stat` / 读回字节     |

## 已知会卡住的地方

已实测的（小程序开发者工具 3.10.15 模拟器，基础库 2.10.15，2026-10-03）：

- **模拟器逻辑层的 `WebAssembly` 是假象**：工具把逻辑层跑在 Chromium iframe 里，浏览器自带的 `WebAssembly` 漏了进来。文档只承诺 Worker 里的 `MYWebAssembly`，矩阵不拿这条当证据
- **Worker 里没有 `my`**：`MYWebAssembly` 能用，但拿不到 `getFileSystemManager`，WASM 与 FS 分在两个线程
- **FS 失败是返回值而不是异常**：`{ error: 10022, errorMessage }` 这类对象要自己判；内部错误换成字符串 `errorCode: '90000'`
- **写 `ArrayBuffer` 落盘成 base64 文本**：读回字节数变成 4/3 倍。只有先 `my.arrayBufferToBase64` 再以 `'base64'` 写入才是原始字节；传 `Uint8Array` 直接报 90000
- **读回的 `ArrayBuffer` 来自别的 realm**：`instanceof ArrayBuffer` 为假，探针用 `Object.prototype.toString` 判

尚待确认的：

- **真机的全部行为**：还没有真机报告，上面 FS 两条尤其要在真机复核
