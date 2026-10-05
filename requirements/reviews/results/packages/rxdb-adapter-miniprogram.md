---
kind: review-execution
object: rxdb-adapter-miniprogram
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-adapter-miniprogram：实际评审执行记录

> **2026-10-05 基线说明**：下面早期批次的“本轮”指该节自己的历史日期，不指本次并行实审。当前结论以文末「local-adapters 并行实审收束」为准；历史已修 RV 不复报。

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

实验性微信逻辑层单 realm/单连接 wa-sqlite adapter 与内存缓冲文件 VFS。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-adapter-miniprogram/src/RxDBAdapterWaSqliteMiniProgram.ts`](../../../../packages/rxdb-adapter-miniprogram/src/RxDBAdapterWaSqliteMiniProgram.ts)
- [`packages/rxdb-adapter-miniprogram/src/runtime-capabilities.ts`](../../../../packages/rxdb-adapter-miniprogram/src/runtime-capabilities.ts)
- [`packages/rxdb-adapter-miniprogram/src/runtime-polyfills.ts`](../../../../packages/rxdb-adapter-miniprogram/src/runtime-polyfills.ts)
- [`packages/rxdb-adapter-miniprogram/src/loader.ts`](../../../../packages/rxdb-adapter-miniprogram/src/loader.ts)
- [`packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts`](../../../../packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts)
- [`packages/rxdb-adapter-miniprogram/src/statement-cleanup.ts`](../../../../packages/rxdb-adapter-miniprogram/src/statement-cleanup.ts)
- [`packages/rxdb-adapter-miniprogram/package.json`](../../../../packages/rxdb-adapter-miniprogram/package.json)
- [`packages/rxdb-adapter-miniprogram/project.json`](../../../../packages/rxdb-adapter-miniprogram/project.json)
- [`packages/rxdb-adapter-miniprogram/src/index.ts`](../../../../packages/rxdb-adapter-miniprogram/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 支持边界与前置能力：对照 README 的微信逻辑层、同步 WASM、单连接、rollback journal 和约 10 MB 验证范围。
- [ ] C2 WASM / glue 与 polyfill：核查 WXWebAssembly、精确依赖资源、文本编码和同步 callback；不要把异步能力伪装成同步。
- [ ] C3 安全随机：审查随机池补给、耗尽、调用次数与熵来源，不以可用性替代安全性。
- [ ] C4 文件 VFS 与事务：追踪 read/write/truncate/close、文件缓冲、journal、范围验证和 statement cleanup。
- [ ] C5 真实设备证据：对照 mock、real-wasm、miniprogram E2E 的实际宿主；不同证据不能互相替代。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-05：local-adapters 并行实审收束

**execution: partial；整对象未 closed。原 C 全边界核销 0/5。** 这不是把“看过入口/有测试文件/覆盖率达标”当完整深审；未阅读和未测的面在下表明确保留。原完成条件不删、不放宽、不自动打勾。

### 本轮基线与实际验证

- 日期：**2026-10-05（Asia/Shanghai）**。源起点以 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/scope.json` 的逐文件 SHA256 为准；收束复核 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/closeout-source-fingerprints.json`。历史 `2026-10-03/04` 结果只作历史，不是本轮基线；用户已修 RV-045/046/050/058 不按旧红复报。
- 实读文件及关注点：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/file-inspection.json`。段落实读不等于整文件读完；清单盘点不等于阅读。未穷举全部受控配置/测试/fixture/构建资源，所以第一条完成条件未满足。
- 主控串行执行。69对象 strict lint/typecheck 的 exit=0、cacheDisabled=true、source drift=[]，证据 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`。本子任务**没有运行 Nx test/build/e2e/coverage、server 或容器**。三个本轮新回归未出现在这两批输入指纹里，不能借旧批次宣称它们已过 late lint/typecheck。
- 本对象已结算证据：Tests 12 failed | 341 passed (353)（/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt:2804）。
- 未取得该对象当轮同代 summary/final，不引用库存或历史覆盖率。覆盖率只对应原配置 include/exclude、该次执行宿主与已执行项；skip 不折算通过，源码语义与真实持久化需另证。
- 当前范围内意见：**LA-04 / P1（当前源码、来源和当轮加载失败确认）**。候选统一写 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/findings.pending.md`，由主控聚焦、去重、编号；不修改总 RV 台账。

### 逐 C 实际证据与核销表

| C   | 实读源码/实际证据锚点                                                                                                                                                                                                                                                                                                  | 当前结论/可证反证                                                                                                                                                                                        | 原 C 核销 | 剩余必要验证                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-miniprogram/README.md:3–16`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-miniprogram/src/host.ts:181–206`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:620–623,804–810,867–870`                     | 当前支持面已从原C的单微信扩为微信/抖音/支付宝；原“非微信全拒绝”不能按旧计划照抄。SQL单realm/单连接、rollback journal、约10MB及不承诺fsync/crash-safe仍明示；支付宝随机Worker不等于SQL Worker transport。 | 未核销    | 按当前三平台矩阵重新穷举能力/拒绝/第二连接与环境档位；LA-04使支付宝启动阻断，不核销C1；Android尚未验证。                         |
| C2  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-miniprogram/src/subframe-glue.ts:20–25`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-miniprogram/src/loader.ts:39–70`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-miniprogram/src/hosts/alipay-wasm.ts:25–31,92–101`                  | LA-04确认当前部署缺陷：glue和精确依赖升级1.4.0，读取器仍只认1.3.1指纹。registry原tgz integrity=lock，安装WASM/glue与发布包逐字节同；不是取证环境被改写。初始化错误经race可见。                           | 未核销    | 修复后两种读取形态/错资源/glue/WASM配对全回归；文本编码坏UTF-8与sync callback/polyfill尚未全穷举；不盲删指纹或放宽接受旧二进制。 |
| C3  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-miniprogram/src/runtime-polyfills.ts:63–154,237–253`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-miniprogram/src/host.ts:136–162`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-miniprogram/src/hosts/alipay-random.ts:61–121,133–142` | 随机池接管新缓冲/消耗擦零，25%预约补给、3次失败上限，耗尽报cause；支付宝共享Worker通道ID/队列/超时处理。未观察到Math.random降级。                                                                        | 未核销    | 长时补给/启动失败/耗尽/宿主违约随机源、各宿主真正熵API与调用次数上限的全部场景；Node/mock随机不能证明设备熵来源。                |
| C4  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:349–369,401–476,486–535,669–791`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-miniprogram/src/statement-cleanup.ts:17–46`                                                                                       | 单文件/分块store按实际落盘记dirty，短读零填，quota映射SQLITE_FULL并让出回滚余量；close释放连接表；扫尾不抢先finalize FTS内部statement。锁/fdatasync的缺失是明示限制，不谎称crash-safe。                  | 未核销    | 文件失败/超范围/内存压力/rollback/关库重开完整边界、每平台quota恢复；12个支付宝失败挡住对应宿主场景，不可用其它host绿抵消。      |
| C5  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-miniprogram/src/__tests__/real-wasm.integration.spec.ts:1–31,68–119`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-miniprogram/README.md:9–16`                                                                                                      | real-wasm套件用Node fs与wechat-shaped注入API，确有写-关-重开，但不是微信DevTools/真机。当前353测试中341pass/12fail只在Node等配置测量面。README旧设备声明不等于本轮重跑。                                 | 未核销    | 三平台DevTools与iOS/Android实机启动/重开CRUD及精确资源指纹分列；历史设备证据新源匹配复核未完成；崩溃恢复仍是明确不承诺。         |

### 完成阻断与交接

- 全对象源码/配置/全部测试及打包面尚未全部实审；跨宿主/适用三框架的真实用户链路、持久化刷新、发布 consumer 与各 skip 原因尚未闭环。**0 个整对象完成**，不能以局部通过声明发布就绪。
- 已发送请求：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/validation-requests.json`；已观察结果：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/validation-observed.json`。不再新增探针或第五个候选。主控后续 late probes/全矩阵结果统一追加；本段不预测在途目标成功，也不把未来补证算入核销。
- 评审结论只限上述证据：有明确问题的局部是 🔴；没有新增问题不代表 🟢。本轮保留 partial，完整评级须原完成条件都满足后再给。
