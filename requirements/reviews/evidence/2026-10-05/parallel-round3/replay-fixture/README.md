# R3-03 Replay Angular：夹具 / mock / 缓存因果补证（冻结）

**源码阅读及逐 C 意见交付已完成；本专题证据部分核销；发布验证独立 pending。** 主控最新统计：十包 153 文件全文阅读、逐 C 意见已完成。本补证不因平台红灯倒扣该进度。按用户最新要求停止追测，未新增确认产品缺陷。

冻结 spec SHA256：`aa62d9cf16d8c66c49e7a5a9f126c8c222915fe499de22051b87c8146efb06fd`；接手旧源 SHA256：`47478ce39514355ef208742835603a1e6ef1296eabb499290ef83ceb54edc6fd`。旧源、R2 历史失败 raw/inputSHA、各中间源均保留。

## 最小因果对照

| 测量 | 实际结果 | exit | 判定 |
| --- | --- | --- | --- |
| [06-baseline-original-only](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-fixture/06-baseline-original-only/20261005T150910199442.txt) | 9 pass / 0 fail / 9 total | 0 | 既有组件文件 9/9；历史旧套 10/10 还含 release-config，本次没有把该用例计入单文件。 |
| [07-baseline-r2-only](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-fixture/07-baseline-r2-only/20261005T150917314045.txt) | 3 pass / 11 fail / 14 total | 1 | 原 R2 rrweb mock 未命中：11 fail、3 pass、21 个未处理错误，不能登记产品 bug。 |
| [08-baseline-pair-no-isolate](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-fixture/08-baseline-pair-no-isolate/20261005T150925616281.txt) | 3 pass / 20 fail / 23 total | 1 | 不隔离合跑旧文件也红；其 parity 输入不是完整 ReplayManager，真实 core 被组件缓存带入旧 spy 测试。 |
| [26-fresh-query-r2](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-fixture/26-fresh-query-r2/20261005T153054992045.txt) | 15 pass / 0 fail / 15 total | 0 | 真实组件用独立模块键，保留共享 TestBed/平台；15/15，无未处理错误/NG0912。 |
| [27-fresh-query-pair-no-isolate](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-fixture/27-fresh-query-pair-no-isolate/20261005T153108699714.txt) | 24 pass / 0 fail / 24 total | 0 | 相同中间 SHA 下单 worker/isolate=false 合跑 24/24，旧 9 条恢复；缓存污染因果闭合。 |
| [28-final-independent](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-fixture/28-final-independent/20261005T153621267684.txt) | 18 pass / 1 fail / 19 total | 1 | 最终冻结 SHA：18 pass/1 fail；唯一红在 RAF 测试末尾全局 frames.size=1，归属 pending。 |
| [29-frozen-minimal-pair](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-fixture/29-frozen-minimal-pair/20261005T153739704095.txt) | 27 pass / 1 fail / 28 total | 1 | 同最终 SHA 合跑：27 pass/1 fail；旧文件 9/9，唯一红与独立相同，未再次污染旧用例。 |

最终两次源码 SHA 相同，独立 19 条里 18 通过，合跑 28 条里 27 通过。合跑旧组件文件 9/9；唯一红均是全局 RAF Map 剩 1 条，不再是 core/mock 污染旧文件。没有 skip，没有将测试进程 exit 1 写成全绿。

## 有效边界与未验边界

- 真正执行原生产 Angular 组件和真实 core 的 mount/create、控制、状态、输入更新、代际取消逻辑。包 mock 只是源函数转发，guard 验证函数恒等且非 mock；组件独立模块键不修改组件源码。rrweb 和 ReplayManager 受控，不是完整真实录像 / iframe / 恢复数据库链。
- 已证 loading/empty/error/ready、挂载后 pending seek 与 initialTime、seek 夹紧及 +1 偏移、play/pause/finish 输出、replay/session 同轮输入合并、旧加载/旧恢复取消、DestroyRef 后不再输出/复建、destroy 一次。成功/四种拒绝/错误与双 pending restore 是受控结果转发，不证明工作树 CAS。
- 父子 provider 只证明分轮加载且两个实例同时存活时独立读取/销毁。原同轮 load 的 mock 漏出日志保留，动态装载/真实 iframe 边界未核销。没有靠 UNSAFE_allowUnprotectedRebuild 放过 rrweb 安全检查。
- **RAF pending**：失败在最后 `frames.size === 0`，destroy 一次和晚帧/命令不输出已先断言通过。该 Map 拦截全局 RAF，可能包含 Angular/TestBed 调度；目前无法证明残帧属于 Replay core。冻结，不删断言、不改业务、不登记新产品 bug。

## 严格声明证据（不靠 skipLibCheck）

- 独立真实 tar consumer 只读复用，152 个消费输入文件 hash 无漂移；没有安装包、改工具、改他人用例或加 workspace alias。
- `strict=true / skipLibCheck=false / skipDefaultLibCheck=false / noEmit=true`。consumer raw exit 1：rrdom TS2663×6、TS1254×6；rrweb TS2395×3，合计 15 个第三方声明诊断。另 1 个 TS6059 是本 runner 把 rootDir 错设为仓库导致的探针错误，不计产品问题。
- 中间 spec 严格 probe raw exit 1，另有仓库 DOM + WebWorker 双 lib 的 34 个冲突诊断。保留 49 个原诊断，不冒充最终冻结 spec 已严格编译通过。修正后的 DOM/rootDir helper 未重跑，按冻结要求 pending。
- 本 R3 未执行 lint，未重测覆盖率或 build，不继承旧门禁绿；测试 CLI 关闭 coverage 只用于聚焦因果，不修改覆盖阈值。

## 实际执行口径

共享锁下 29 个 Nx 命令：21 次聚焦测试、2 次严格类型 probe、6 次 discovery/help。总 exit 0×9、exit 1×20；其中聚焦测试 exit 0×4、exit 1×17，两个类型 probe 均 exit 1。Vitest 原报总计 385 case 执行（含重复、hook 前失败）：247 pass、138 fail、0 skip；不是 385 个不同场景，更不是全对象覆盖。
每次保留 raw/status/scoped inputSHA，最后两次还保存 expanded inputSHA。唯一范围外观测差异是另一个 core 新增 review-parallel-restore.spec.ts 和共享 HEAD 外部变化；本任务没有写它，生产代码/既有 spec/依赖/配置 hash 未变，所有本轮测量 scoped drift 为 0。

完整执行、阶段源 hash 和归属见 [/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-fixture/executions.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-fixture/executions.json)、[因果说明](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-fixture/causality.json)、[闭环](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-fixture/closure.json)、[严格声明](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/replay-fixture/strict-declarations.json)。

**新确认产品问题 0；新产品风险候选 0。两项未归属夹具 pending 交主控裁定，不以红灯自动扩大为 Angular 或 Replay core 产品缺陷。**
