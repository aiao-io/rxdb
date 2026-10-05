---
kind: review-plan
object: dev-rxdb-miniprogram-alipay-probe
source_root: apps/dev-rxdb-miniprogram-alipay-probe
created: 2026-10-05
baseline: a23a2948f5cc8e94519b9898e38d906df8624df8
execution: partial
---

# dev-rxdb-miniprogram-alipay-probe：遗漏范围补审与实际核查

**部分实审，0/6完整C核销，整对象未closed。** 这是本轮实际阅读回填，不是泛计划；私有/实验性应用不豁免审查。六个C各有源码结论和明确未验，不把lint/typecheck绿提升为整对象通过。

## 1. 范围与本轮事实

- 日期：**2026-10-05（Asia/Shanghai）**；只读既有应用，无新业务改动、无新probe、无GUI/测试/构建执行。
- 纳入原因：resolved Nx已经有此node，旧应用计划漏列，不是本次创建的新工程；主控负责第三个alipay-probe-e2e，本记录不改它。
- 受控来源：**46文件**；实际阅读 **28个文件、36段**，其余 **18个文件未读**。盘点不是阅读完成，完整测试主体和若干API/实验文件仍未穷举。
- 初始内容指纹与resolved node：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/app-scope-addendum/dev-rxdb-miniprogram-alipay-probe/scope.json`；逐文件关注点/未读列表：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/app-scope-addendum/dev-rxdb-miniprogram-alipay-probe/file-inspection.json`；外部改动差异：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/app-scope-addendum/dev-rxdb-miniprogram-alipay-probe/closeout-source-fingerprints.json`。收束发现2个受控配置/源码指纹与读起点不同，未扩读重审，不用旧锚点伪装最新修改已审。
- 最新主控结算：**3应用 strict lint=0、当前 typecheck=0**。当前日志 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/added-apps-typecheck-current.txt`；来源和初版失败区分在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/app-scope-addendum/dev-rxdb-miniprogram-alipay-probe/validation-observed.json`。初版MJS跨rootDir与并发外部project修改失败保留历史，不能报告当前typecheck仍红。
- SDK旧资源指纹/base factory/oo1问题已由外部修复，主控2+27案例通过；本轮只引用**历史修复事实**，不挂已删除RV文件，不另编号、不作为当前应用bug。SDK聚焦绿也不是本应用全套/设备绿。

## 2. 六个C：实际证据、结论及必要未验

| C | 专项 | 实际源码锚点 | 当前结论 | 状态 | 必要未验 |
| --- | --- | --- | --- | --- | --- |
| C1 | 真实应用身份、入口与SDK边界 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/static/app.json:2–6`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/src/page.ts:47–80`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/src/run-probe.ts:54–75,185–207,223–259`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/src/core.ts:79–85` | 这是已存在的支付宝逻辑层原生应用，页面启动即编排实验；核心包是字面量懒require。正式host走SDK公开入口，内部指纹/帧头经official-host源码桥接。core实际调用createWaSqliteMiniProgramClient和SQL，不是完整RxDB仓库/历史/加密业务验证。私有、实验性不构成免审理由。 | 部分实审；未完整核销 | 未核对全部API接口/环境采集/所有fixture；当前源码资源版本与DevTools/iOS/Android的整应用启动、重复运行和卸载取消未本轮实测。 |
| C2 | 构建、代码包资源及版本闭合 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/scripts/build.mjs:23,131–195`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/src/official-host.ts:7–26`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/src/experiments/wasm.ts:43–66`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/static/mini.project.json:2–7` | 构建用@aiao/source、ES2018，复制同一依赖的WASM及base64文本副本，随机Worker从SDK公共子入口原样复制，app声明Worker且IDE忽略其转译。旧SDK指纹问题已由外部修复、主控复验通过，只作历史说明，不另编号、不挂已删除RV链接。读取时及收束存在性核对均未找到所import的根subframe-realm.mjs；这是静态构建输入缺口，尚未动态执行build。 | 部分实审；未完整核销 | 主控当前lint/typecheck=0不能代替Node构建/产物闭合；缺helper需确认/补证，修复后核对binary与文本副本、worker脚本、banner/错误包装、干净构建与VM smoke。未复跑真实代码包/设备，不使用旧dist补绿。 |
| C3 | realm、引导与安全随机 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/scripts/build.mjs:61–115`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/src/run-probe.ts:157–165,210–235,295–303`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/src/experiments/random.ts:52–70` | banner用候选realm检查、临时Object.prototype getter在finally删除；正式host自行找全局。Runner先完成引导探测的结算，再加载core，不能把probe失败说成成功引导。Worker探测失败保留skip/error，最终terminate；随机只观察64KiB/1MiB结果，未发现Math.random降级。随机统计不构成设备熵来源证明。 | 部分实审；未完整核销 | 环境采集/repair快照完整实现尚未读完；原生随机API与限额、无真实realm/缺BigInt/回调超时/耗尽、页面卸载和Worker在途资源需宿主/完整现有测试补证。 |
| C4 | 文件、持久化与配额失败 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/src/core.ts:88–147,151–216`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/src/run-probe.ts:127–137,237–263`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/src/experiments/quota-accounting.ts:95–175`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/src/alipay-fs.ts:43–69` | 辅助FS不分帧，只用于原始实验、清理和列文件；adapter用正式host帧头FS。持久化参数绑定，写-关-重开比较行和integrity；配额用zeroblob，不消耗安全随机池，撞满后不先删库而直接重开。目录限制在固定实验子目录，cleanup结果入报告；unexpected异常下不能把正常路径rmdir夸成总在finally清理。 | 部分实审；未完整核销 | raw/fs-errors、全部失败/残留/内存压力分支与接口尚未全读；默认60MiB写计划和裸文件72MiB上限未执行，不能声称实机配额或crash-safe。真实设备关库、失败恢复及清理副作用待证。 |
| C5 | 报告可证性、错误与UI语义 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/src/findings.ts:108–128,144–181,231–272,280–303`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/src/probe.ts:22–39`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/src/page.ts:38–41,60–92` | compile/选源成功不代替adapter实例化；skip不作pass。配额通过要求SQLITE_FULL+平台原文+重开行数+integrity+连续块；未撞满至少30MiB才pass且带quota-unobserved，否则unknown。UI“完成”代表实验结束，不代表全绿；逐行finding保留fail/unknown，复制由用户按钮触发。 | 部分实审；未完整核销 | 错误描述/报告字段及现有判定fixture未全部核查；当轮JSON可序列化、cause链异常、报告版本/设备/资产指纹对应、重复运行与实际UI显示未验证。旧设备报告不能自动迁移至已修新SDK。 |
| C6 | 测试、门禁与证据分层 | `/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/vitest.config.mts:10–25`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/src/__tests__/fake-alipay.ts:15–46`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/src/run-probe.spec.ts:1–39`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/src/dist-smoke.spec.ts:1–19`；`/Users/jimmy/Documents/aiao/rxdb/apps/dev-rxdb-miniprogram-alipay-probe/tsconfig.spec.json:5–10` | 现有源测试用Node/fake my，WASM字节从依赖实际读取，Worker用Node vm/WebCrypto；产物smoke也是VM，不是支付宝DevTools/真机。主控已补跑3应用strict lint=0、最新typecheck=0；初版MJS跨rootDir/并发project变动失败只属历史。新配置与读取起点差异单列，不继承旧69对象门禁。 | 部分实审；未完整核销 | 本应用当轮test/build/coverage及其skip/测量面未取得；多数测试主体未读，当前target范围需据日志区分MJS/fixture而非由typecheck=0推断。DevTools、iOS预览、Android预览证据分别补，不运行GUI、不等待全矩阵。 |

## 3. 完成条件与交接

- [ ] 全部受控来源、配置、测试/fixture和关键构建输入完成实审。
- [ ] 六个C完整边界都有结论，动态主张来自当轮执行，不继承历史或mock设备结论。
- [ ] 当前build/test/coverage及测量面、skip、资源来源闭合，真实宿主证据明确分列。
- [ ] 外部变更后涉及的源码锚点按新指纹复核，不以旧读证明修复。

当前strict lint/typecheck已由主控补证；其它条件未满足，**保留partial**。不新增probe、不等待全矩阵。实际记录 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/apps/dev-rxdb-miniprogram-alipay-probe.md`；构建输入静态缺口 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/app-scope-addendum/dev-rxdb-miniprogram-alipay-probe/critical-build-inputs.json`；已承接验证请求 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/app-scope-addendum/dev-rxdb-miniprogram-alipay-probe/validation-requests.json`。
