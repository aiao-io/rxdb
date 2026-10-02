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
5. 真机调试、预览都要在 `mini.project.json` 关联真实 AppID（别提交进仓库），模拟器不需要；真机上点「复制报告」后粘到电脑即可

## 报告怎么读（`probe: 'alipay-probe v2'`）

| 字段          | 内容                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `environment` | `systemInfo`、基础库 `SDKVersion`、`USER_DATA_PATH`；`freeGlobals` 是逻辑层直接引用各全局名的 `typeof`（未声明时记 `throws: ReferenceError`）；`sloppyThis` 是非严格函数的 `this`；`canIUse` 逐项探 API |
| `wasm`        | 逻辑层的 `MYWebAssembly` 与 `WebAssembly`：存在性，以及用 `/wasm/add.wasm` 实例化后 `add(2, 3)` 的结果                                                                                                  |
| `worker`      | `my.createWorker('workers/index.js', { useExperimentalWorker: true })` 是否创建成功；`outcome` 是 Worker 回传的同一组探测（`MYWebAssembly` / `WebAssembly` / `my` / FS / `crypto.getRandomValues`）     |
| `random`      | `my` 的全部成员（`myMembers`）及名字像随机源的候选（`suspicious`）、`my.getRandomValues`、逻辑层 `crypto.getRandomValues`                                                                               |
| `fileSystem`  | `methods`：同步方法逐个是否存在；`steps`：错误路径与正常路径的原始返回值；`roundTrip`：四种写入方式（`ArrayBuffer`、带 `'binary'`、base64 串配 `'base64'`、`Uint8Array`）的写入 / `stat` / 读回字节     |

## 已知会卡住的地方

已实测两端（2026-10-03）：小程序开发者工具 3.10.15 模拟器（基础库 2.10.15），iOS 真机调试（iOS 26.6.2 / 支付宝 12.12.30 / 基础库 2.10.42）。

| 现象                                 | 模拟器                               | iOS 真机调试                             |
| ------------------------------------ | ------------------------------------ | ---------------------------------------- |
| 逻辑层 `MYWebAssembly`               | 没有                                 | 没有                                     |
| 逻辑层标准 `WebAssembly`（未文档化） | 能用，`add(2, 3) === 5`              | **也能用**，`add(2, 3) === 5`            |
| Worker 里的 `my` / FS                | 没有                                 | 没有（JSC 报 `Can't find variable: my`） |
| Worker 里的 `crypto.getRandomValues` | 有（未文档化）                       | 有（未文档化）                           |
| 逻辑层 `globalThis` / `BigInt`       | 都没有                               | 都有                                     |
| 写 `ArrayBuffer`                     | 落盘成 base64 文本，9 字节变 12 字节 | 原样 9 字节                              |
| 写 `Uint8Array`                      | 报 90000                             | **返回 `success`，落盘 0 字节**          |
| `renameSync` 到已存在的目标          | 报 10025                             | 直接覆盖                                 |

两端共同的：

- **FS 失败返回错误对象，不抛**：`{ error: 10022, errorMessage }` 这类对象要自己判断。iOS 多一个 `message` 字段，文案与模拟器不同
- **没有 `openSync` / `readSync` / `writeSync` / `truncateSync`**：只有整文件读写
- **逻辑层拿不到任何随机源**：`my.getRandomValues` 不存在，`canIUse` 为 `false`，也没有 `crypto`
- **读回的 `ArrayBuffer` 可能来自别的 realm**：`instanceof ArrayBuffer` 不可靠，探针改用 `Object.prototype.toString` 判断

模拟器在 FS 字节语义和全局能力上都和真机不一样，凡是涉及这两类的结论都要以真机为准。

尚待确认的：

- **Android 真机**：还没跑
- **非调试的预览模式**：iOS 那次是接着调试器跑的，逻辑层的 `WebAssembly` 在预览模式下是否还在，没验证
