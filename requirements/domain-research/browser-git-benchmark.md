# isomorphic-git 与 wasm-git：浏览器性能评估

> 2026-10-18，本机 Chromium 实测。原始逐轮数据见
> [browser-git-latest.json](../../benchmarks/reports/browser-git-latest.json)，
> 复现入口见 [benchmarks README](../../benchmarks/README.md#浏览器-git-选型基准)。

**结论：先前仅凭 API 易集成而推荐 isomorphic-git 的依据不足，应调整为优先验证 wasm-git
JSPI / Asyncify 的产品接入。** 在本次统一 MEMFS 对照中，wasm-git 的大部分读操作、提交与 checkout
更快，isomorphic-git 的十文件暂存更快。OPFS 方案的差距还受到整库缓存影响，不能据此声称 WASM 在所有场景更快。

当前 isomorphic-git 1.44.3 的 FS 接入复现了同秒等长改写漏检；wasm-git pthreads 的官方 JS 写入封装
和重开状态也未通过。本次应继续推进 JSPI / Asyncify 原型，同时验证浏览器覆盖、内存与持久化边界；
没有任何一行耗时代表完整 IDE 已可交付。

## 研究分支 011 复验（2026-10-31）

为验证当前依赖没有改变选型结论，分支 `011-browser-git-opfs` 用 Chromium 156 对 100 文件 fixture
各跑一轮 `isomorphic-git 1.44.4`、`wasm-git 0.0.17` JSPI 和 Asyncify。三种配置都通过 clone、
修改、暂存、提交、`branch → checkout`、tree/OID/文件字节校验与 Worker 重开；isomorphic-git 仍在
同秒等长改写时返回 clean，JSPI / Asyncify 均检测到变更。原始逐轮数据见
[`browser-git-research-011.json`](../../benchmarks/reports/browser-git-research-011.json)；1000 文件档见
[`browser-git-research-011-medium.json`](../../benchmarks/reports/browser-git-research-011-medium.json)。

本轮是正确性复验，不是性能门禁；单次耗时不能替代基准中的五次中位数。结论保持为：固定 JSPI /
Asyncify 做受限 Worker + OPFS 原型，isomorphic-git 先修正 FS 元数据语义后再重评，pthreads 与 Rust
自研路线暂缓。

## 环境与口径

- Apple M1 Max，10 逻辑核，32 GiB RAM；macOS 内核 Darwin 27.0.0。
- Chromium 156.0.8078.4，Node v26.12.0；isomorphic-git **1.44.3**，wasm-git **0.0.17**，Buffer **6.0.3**。
- 两档合成源码仓库：100 / 1000 文件，每文件 4096 字节，嵌套目录，总工作区约 0.39 / 3.91 MiB。
  普通文本文件，不含 symlink、可执行位、submodule、LFS 或大型历史。
- 每个配置 / 档位独立浏览器上下文采样五次，共 60 次；配置按正反顺序轮换，串行执行。
  新 Worker 初始化与热 status 分别记录；未把 Worker ready 定义成冷浏览器进程启动。
- clone 指向 loopback 原生 `git-http-backend`，包含本机服务开销，不包含公网延迟和认证。
- 表中单位均为 **ms，中位数**。commit 不含暂存；原始 JSON 同时保留各样本、最小 / 最大和最近秩 p95。
  五样本的该 p95 就是最大值，不作为稳定尾延迟。

## 统一 MEMFS：控制文件系统实现

两引擎分别使用相同 Emscripten MEMFS 实现的新实例。isomorphic-git 经窄 `fs.promises` 适配层访问，
wasm-git 经 libgit2 调用；这是引擎及调用层对照。isomorphic-git 此配置为借用 MEMFS 也加载了 wasm
运行时，因此不能用这个配置的 ready 时间或 linear memory 推导其生产启动 / 内存成本。

| 文件数 | 方案                        | clone | 热 clean status | 修改 status | 暂存 10 文件 | commit | checkout 原提交 |
| ------ | --------------------------- | ----: | --------------: | ----------: | -----------: | -----: | --------------: |
| 100    | isomorphic-git + 统一 MEMFS |  84.3 |             3.6 |         6.6 |          5.3 |    8.3 |             5.8 |
| 100    | wasm-git + 统一 MEMFS       |  80.6 |             1.6 |         5.4 |         10.1 |    4.3 |             3.8 |
| 1000   | isomorphic-git + 统一 MEMFS | 300.6 |            22.5 |        25.4 |          7.7 |   43.3 |            24.8 |
| 1000   | wasm-git + 统一 MEMFS       | 201.0 |             7.2 |         9.5 |         15.4 |    8.1 |             9.5 |

1000 文件档，wasm-git 的热 status 约为 isomorphic-git 的 3.1 倍速度，commit 约 5.3 倍；
isomorphic-git 的十文件暂存约快 2 倍。这不是每个 Git 操作的统一倍率。

## OPFS：比较实际存储组合

isomorphic-git 使用本基准的直接异步 OPFS 薄桥，不缓存整个仓库；该薄桥只为普通文件 fixture 编写，
不代表已优化的最佳生产 FS。wasm-git JSPI / Asyncify 将整个仓库加载到 JS MEMFS，pthreads 使用 WasmFS OPFS。
因此这张表比较的是**引擎 + 文件系统 + 缓存**。

| 文件数 | 方案                            |  clone | 热 clean status | 暂存 10 文件 | commit | checkout 原提交 | 重开 + 首次 status |
| ------ | ------------------------------- | -----: | --------------: | -----------: | -----: | --------------: | -----------------: |
| 100    | isomorphic-git + 直接 OPFS 薄桥 |  242.0 |            78.3 |         19.9 |   58.6 |            63.4 |              172.2 |
| 100    | wasm-git pthreads               |  283.9 |           210.0 |         83.7 |   90.1 |            69.5 |              162.2 |
| 100    | wasm-git JSPI                   |  303.6 |            10.6 |         56.9 |   72.5 |            23.7 |              230.0 |
| 100    | wasm-git Asyncify               |  323.1 |            11.7 |         57.3 |   74.0 |            25.1 |              228.8 |
| 1000   | isomorphic-git + 直接 OPFS 薄桥 | 1415.6 |           787.3 |         22.4 |  368.3 |           469.6 |              792.2 |
| 1000   | wasm-git pthreads               | 1568.2 |          1252.9 |        309.3 |  129.7 |           264.8 |              503.7 |
| 1000   | wasm-git JSPI                   | 1793.4 |            38.9 |         61.8 |  115.4 |            30.6 |             1421.6 |
| 1000   | wasm-git Asyncify               | 1956.2 |            29.3 |         71.7 |  117.1 |            31.6 |             1393.1 |

1000 文件档的重要取舍：

- JSPI / Asyncify 热 status 约 29～39 ms，直接 OPFS 薄桥约 787 ms；频繁刷新工作区状态时差异明显。
- isomorphic-git 的 clone 约 1.42 s，JSPI / Asyncify 约 1.79 / 1.96 s。
- isomorphic-git 重开约 0.79 s；JSPI / Asyncify 约 1.42 / 1.39 s，其中恢复整库到 MEMFS 约 1.29 / 1.26 s。
  缓存的热操作收益伴随重新加载成本。
- pthreads 的重开后 status 未通过正确性验证，表中耗时仅为诊断记录，不能解释成正确可用的重开时间。
- 本轮不能稳定判定 JSPI 在所有操作都胜过 Asyncify，需结合目标浏览器与真实项目继续测。

重开总时长按每个样本的「新 Worker ready + restore + 首次 status」求和后取中位数。
第一次 status 之前没有调用 tree 读取来预热；验证、内容生成和快速改写探针不计入操作耗时。

## 正确性：会改变选型的发现

| 方案                            | 同秒等长改写：漏检 / 有效样本 | 上游覆盖写入失败 | 重开脏状态 / 样本 |
| ------------------------------- | ----------------------------: | ---------------: | ----------------: |
| isomorphic-git + 统一 MEMFS     |                         10/10 |                — |                 — |
| wasm-git + 统一 MEMFS           |                          0/10 |                — |                 — |
| isomorphic-git + 直接 OPFS 薄桥 |                           7/7 |                — |              0/10 |
| wasm-git pthreads               |                           0/3 |            10/10 |             10/10 |
| wasm-git JSPI                   |                           0/8 |                — |              0/10 |
| wasm-git Asyncify               |                           0/9 |                — |              0/10 |

同秒样本只统计前后 mtime 位于同一秒的快速等长改写；跨秒检测成功不能充当同秒用例通过。
pthreads 的 1000 文件档没有真正同秒的有效样本，不能据 0/0 推导正确性。

1. **isomorphic-git：同秒等长改写漏检。** 在本次有效同秒探针中，`statusMatrix` 返回 clean，
   而文件内容已改变。固定版本的 stat 比较只比较秒等字段，没有利用纳秒变化；这是现有接入上的
   实测阻断，需要解决并加回归验证，不能直接把异常快的 status 当作性能收益。
2. **pthreads：上游 `FS.writeFile` 追加。** `aa → bb` 得到 `aabb`，十轮都复现。
   [Emscripten 6.0.3 源码](https://github.com/emscripten-core/emscripten/blob/6.0.3/system/lib/wasmfs/js_api.cpp#L67)
   明确使用文件末尾 offset。此基准的编辑操作改用 `open('w') → positioned write → close` 并检查字节数，
   没有修改发布的 wasm；表中的计时对应这层修正桥。
3. **pthreads：重开 status 全脏。** 两档五轮均复现 100 / 1000 文件 dirty；tree OID 与所有文件字节
   都一致。根因尚未定位，不能扩大结论为文件丢失，也不能将该方案记为重开验收通过。

为了仍可测量正常修改场景，计时中的十文件等长改写在探针恢复后额外等待 1100 ms，等待本身排除在计时外。
这条条件对所有配置一致；它用于分离性能实验，不是对产品漏检问题的修复。计时场景的初始 / 修改 tree OID
均与原生 Git 一致，checkout 和 OPFS 重开的文件字节也一致。

上游 auto-loader 在跨源隔离时优先选择 pthreads；它在本轮正确性上未通过，后续原型应固定构建再验收。

## 资产和内存

下表是已记录的主要资产大小，isomorphic.js 含 Buffer polyfill；wasm 路线需要相应 JS 与 wasm。
未计入公共 Worker、HTTP 模块与 OPFS loader，gzip 是离线压缩大小，不是本次 loopback 的实际传输大小。

| 资产                       | 原始 KiB | gzip KiB |
| -------------------------- | -------: | -------: |
| isomorphic.js              |    262.5 |     80.3 |
| vendor/lg2.js              |    108.0 |     29.9 |
| vendor/lg2.wasm            |    842.7 |    353.2 |
| vendor/lg2_opfs.js         |     70.9 |     19.7 |
| vendor/lg2_opfs.wasm       |    953.5 |    390.9 |
| vendor/lg2_opfs_jspi.js    |    103.7 |     28.5 |
| vendor/lg2_opfs_jspi.wasm  |    841.2 |    353.1 |
| vendor/lg2_opfs_async.js   |    107.5 |     29.5 |
| vendor/lg2_opfs_async.wasm |   1589.4 |    536.3 |

两档样本末尾，WASM linear memory 约为 16～16.25 MiB。这个字段不包含 JS MEMFS 缓存、完整 JS 堆、
浏览器进程或峰值 RSS；isomorphic-git 直接 OPFS 配置的该项为不适用，**不能据此宣称哪一方总内存更低**。
完整内存评估及大 pack / 大型真实仓库仍待补测。

## 当前行动结论

- 下一步优先做固定 JSPI / Asyncify 构建的浏览器工作区原型，接入结构化结果与错误，并验证目标浏览器。
- isomorphic-git 保留 API 易集成的优势；先解决同秒修改检测，再评估有元数据 / 内容缓存的 OPFS FS，
  不能把当前无缓存薄桥的耗时当成其最终性能上限。
- pthreads 暂不采用默认配置：先处理覆盖写入与重开 status，再重新比较。
- 本轮没有为从零自研 Rust Git 提供依据；已观察到的差异主要落在具体引擎操作、FS 接入和缓存策略。

基准辅助逻辑的红绿测试 36 项通过，benchmarks ESLint 零警告。基准为探索性评估，不建立未经验证的 CI 性能阈值。
JSON 的源码摘要记录执行时版本；运行后整理了 FS 辅助脚本格式与静态资源路径的跨平台判断，
未改变 Git 操作或计时逻辑。本轮性能结果的已验证平台为 macOS / Chromium。
