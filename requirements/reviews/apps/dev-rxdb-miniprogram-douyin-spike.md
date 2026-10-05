---
kind: review-plan
object: dev-rxdb-miniprogram-douyin-spike
source_root: apps/dev-rxdb-miniprogram-douyin-spike
created: 2026-10-05
baseline: a23a2948f5cc8e94519b9898e38d906df8624df8
execution: partial
---

# dev-rxdb-miniprogram-douyin-spike：遗漏范围补审与实际核查

**部分实审，0/6完整C核销，整对象未closed。** 这是本轮实际阅读回填，不是泛计划；私有/实验性应用不豁免审查。六个C各有源码结论和明确未验，不把lint/typecheck绿提升为整对象通过。

## 1. 范围与本轮事实

- 日期：**2026-10-05（Asia/Shanghai）**；只读既有应用，无新业务改动、无新probe、无GUI/测试/构建执行。
- 纳入原因：resolved Nx已经有此node，旧应用计划漏列，不是本次创建的新工程；主控负责第三个alipay-probe-e2e，本记录不改它。
- 受控来源：**39文件**；实际阅读 **24个文件、28段**，其余 **15个文件未读**。盘点不是阅读完成，完整测试主体和若干API/实验文件仍未穷举。
- 初始内容指纹与resolved node：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/app-scope-addendum/dev-rxdb-miniprogram-douyin-spike/scope.json`；逐文件关注点/未读列表：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/app-scope-addendum/dev-rxdb-miniprogram-douyin-spike/file-inspection.json`；外部改动差异：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/app-scope-addendum/dev-rxdb-miniprogram-douyin-spike/closeout-source-fingerprints.json`。收束发现2个受控配置/源码指纹与读起点不同，未扩读重审，不用旧锚点伪装最新修改已审。
- 最新主控结算：**3应用 strict lint=0、当前 typecheck=0**。当前日志 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/added-apps-typecheck-current.txt`；来源和初版失败区分在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/app-scope-addendum/dev-rxdb-miniprogram-douyin-spike/validation-observed.json`。初版MJS跨rootDir与并发外部project修改失败保留历史，不能报告当前typecheck仍红。
- SDK旧资源指纹/base factory/oo1问题已由外部修复，主控2+27案例通过；本轮只引用**历史修复事实**，不挂已删除RV文件，不另编号、不作为当前应用bug。SDK聚焦绿也不是本应用全套/设备绿。

## 2. 六个C：实际证据、结论及必要未验

| C | 专项 | 实际源码锚点 | 当前结论 | 状态 | 必要未验 |
| --- | --- | --- | --- | --- | --- |
| C1 | 真实应用身份、入口与SDK边界 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/static/app.json:2–4`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/static/project.config.json:2–9`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/src/page.ts:48–75`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/src/run-spike.ts:34–49,153–179`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/src/core.ts:78–84` | 这是已存在的抖音原生逻辑层应用，页面启动即编排实验；正式createDouyinMiniProgramHost接真实平台API。页面/核心拆两个CJS包，core调用公开SQLite client和SQL，不是完整RxDB仓库/加密/分支用户链路。实验性和testAppId不等于无需审查。 | 部分实审；未完整核销 | 全部接口/环境采集及fixture未核完；正式host当前版本的DevTools/iOS/Android整应用启动、重复运行/卸载取消未本轮实测。 |
| C2 | 构建、代码包资源及版本闭合 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/scripts/build.mjs:17,107–154`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/src/experiments/wasm-path.ts:11–38`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/src/run-spike.ts:129–148` | 构建用@aiao/source和ES2020，WASM由adapter依赖同源复制，页面字面量require保持外部核心包，原始顶层错误挂initError再抛。compile相对/绝对路径只作诊断，不替代正式host默认路径。抖音不走支付宝旧指纹读取器，历史SDK问题已修，不外推为当前抖音故障。import根subframe-realm.mjs的静态输入缺口尚未由build补证。 | 部分实审；未完整核销 | 主控lint/typecheck绿不代表缺helper/当前bundle可运行；需要构建输入、源码条件、产物路径/banner/顶层包装及VM smoke补证，实际绝对路径部署与正式host真机启动另证。 |
| C3 | realm、引导与安全随机 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/scripts/build.mjs:51–90`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/src/realm-probe.ts:39–50`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/src/run-spike.ts:156–161`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/src/experiments/random.ts:9–60` | banner检查真实realm并通过host.runtimeGlobal注入，不把空global对象当真全局。原始tt随机调用按64KiB/1MiB/上限+1分列、有10s超时，无Math.random降级；prepare结果是独立probe。摘要非零不证明密码学熵，Node提供的随机源不能代表TT平台能力。 | 部分实审；未完整核销 | 环境/residue检测与宿主异常路径未全部阅读；无编码器/无realm/缺随机/回调永不到或晚到、重复引导污染与设备原生限额尚待完整测试/宿主验证。 |
| C4 | 文件、持久化与配额失败 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/src/core.ts:88–148,152–217`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/src/run-spike.ts:93–104,163–182`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/src/experiments/quota-accounting.ts:75–129`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/src/core-contract.ts:20–24` | 实际SQL写-关-重开和integrity判定与支付宝共享基本逻辑；quota写zeroblob，失败保留cause并直接重开未删库。裸FS覆盖写单独统计旧大小计费；临时文件只在固定aiao-douyin-spike子目录操作。默认30MiB计划是测量上限，不是已证平台容量。 | 部分实审；未完整核销 | fs-errors/环境/接口及全部quota失败分支未读完；真实旧大小计费、空块残留、内存压力、失败后原库、清理失败/异常退出及平台fsync/锁限制未本轮动态验证。 |
| C5 | 报告可证性、错误与UI语义 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/src/findings.ts:74–117,160–215`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/src/probe.ts:22–39`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/src/page.ts:39–42,61–87` | WASM compile成功但未实际持久化时只unknown；quota通过要求FULL/平台原文/行数/integrity/连续块，未观察到quota仍需30MiB且带caveat。UI完成不代表finding全绿，未运行/失败字段分开，JSON日志和剪贴板供人工回填，不把本次单设备证据泛化。 | 部分实审；未完整核销 | describe-error与全部报告fixture/渲染主体尚未完整读完；当前版本JSON/cause链、设备/资源来源一致性、重复运行/实际界面与报告搬迁仍需验证。 |
| C6 | 测试、门禁与证据分层 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/vitest.config.mts:10–25`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/src/__tests__/fake-douyin.ts:24–54`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/src/run-spike.spec.ts:1–45`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/src/dist-smoke.spec.ts:7–37`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-douyin-spike/tsconfig.spec.json:5–10` | 源测试是Node fake tt/文件系统/WASM组合；dist-smoke是node:vm模拟不同realm，不是真抖音。主控最新3应用strict lint=0/typecheck=0已记录；初版跨rootDir/外部project变化失败保留历史，不借旧69对象通过，不把新target绿折算所有fixture/产物。 | 部分实审；未完整核销 | 本应用当轮test/build/coverage四指标与skip未取得；大部分spec主体未读，最新typecheck测量面与旧起点变化要分列。历史v9设备报告不能替代当前v10/正式host各设备重跑；不运行GUI。 |

## 3. 完成条件与交接

- [ ] 全部受控来源、配置、测试/fixture和关键构建输入完成实审。
- [ ] 六个C完整边界都有结论，动态主张来自当轮执行，不继承历史或mock设备结论。
- [ ] 当前build/test/coverage及测量面、skip、资源来源闭合，真实宿主证据明确分列。
- [ ] 外部变更后涉及的源码锚点按新指纹复核，不以旧读证明修复。

当前strict lint/typecheck已由主控补证；其它条件未满足，**保留partial**。不新增probe、不等待全矩阵。实际记录 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/apps/dev-rxdb-miniprogram-douyin-spike.md`；构建输入静态缺口 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/app-scope-addendum/dev-rxdb-miniprogram-douyin-spike/critical-build-inputs.json`；已承接验证请求 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/app-scope-addendum/dev-rxdb-miniprogram-douyin-spike/validation-requests.json`。
