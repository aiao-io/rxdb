---
kind: review-execution
object: rxdb-plugin-working-tree-react
source_root: packages/rxdb-plugin-working-tree-react
updated: 2026-10-05
worker: PKG-working-tree-react
execution: complete-original-scope
source-review: complete-original-scope
assessment-delivery: complete-original-scope
scenario-validation: remaining-owners-listed
release-validation: not-complete
rating: "🔴"
---

# rxdb-plugin-working-tree-react：全文评审与逐 C 意见
**🔴 状态ownership不合格：RV-069/P1 Open使数据库身份切换后仍显示并接收旧库状态。源码全文 / 原 C 意见：complete-original-scope；专项运行与发布验收另列。**

同SHA已证P1跨库状态残留及迟到覆盖，比单纯文档或未测风险严重；100%薄封装覆盖不能抵消P1。另有局部P3文档漂移，不影响主评级依据。

- 全文：**13/13 文件，1088/1088 行**；原 C **5/5 意见交付**，不是原场景全部测试通过。
- 确认意见：既有复用 1；新增 1（新增业务 0，局部文档 1）；candidates 0。
- releaseReady=false；专项/发布未验归属独立登记；不修改原业务/测试/依赖/index，不派agent。

## 1. 范围与阅读证据

- 唯一对象：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react`；13 文件 / 1088 行，源码/config/tests/docs/license 全范围。
- 沿用冻结scope标识 `943c50cc85b4be3b0635f736a35a9659c3fe209a`；实际阅读以当前文件SHA及真实区间为准，不自行执行Git操作。
- [scope](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-working-tree-react/scope.json) / [resolved](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-working-tree-react/resolved-project.json) / [冻结核对](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-working-tree-react/scope-freeze.json)；没有把project.json局部targets当完整配置。
- 旧文档先读并保留：[旧plan](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-working-tree-react/baseline/original-plan.md) / [旧results](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-working-tree-react/baseline/original-results.md)；旧partial不能继续冒充本次源码状态，原场景仍保留。
- [全文台账](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-working-tree-react/file-inspection.json)记录实际SHA、N、真实readRanges、具体notes/C；输出trace与hash盘点不自动等于阅读。

支撑依赖只读必要契约，不交付另一个包：[dependency-inspection.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-working-tree-react/dependency-inspection.json)。

## 2. 确认问题 / 去重 / 影响边界

### RV-069 — P1 / Open
责任角色：React working-tree维护者；处置：reused-existing-confirmed-issue。
commands因database换新，states与稳定patch未按database identity重置/作废旧写回；A/B独立核心generation不能隔离共用sink。
源码：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts`，实际区间 `[[84, 95]]`。
证据：同SHA历史2失败；旧A状态留在B且迟到A true覆盖B false。
未证明向错误数据库落写；旧diff含patch/inversePatch的影响是同根因源码推导，不是另一个实测泄露。


### PKG-WTR-DOC-01 — P3 / Open
责任角色：React working-tree文档维护者；处置：package-local-source-confirmed-documentation-opinion。
README仍称十个状态/十个方法/十格，当前公开类型与spec数量断言已是十二；源码1–3旧注记与20–21新TSDoc亦不一致。
源码：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/README.md`，实际区间 `[[52, 54], [66, 68]]`。
证据：src/use-working-tree.ts:20–42与use-working-tree.spec.tsx:484–526，以及已读核心十二签名/十二初值声明。

移除硬编码旧数量或同步成当前十二项；不改公开API，不需要运行大门禁。

历史输入指纹、原日志/测量分母/复用限制：[reused-evidence.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-working-tree-react/reused-evidence.json)。旧红探针不删、不skip；不重复创建同根因RV。

## 3. 每个原 C 的结论 / 锚点 / 未验归属

### C1 状态与作用域 — 原源码意见已交付
**原动作**：核查 activation/branch/能力状态如何进入 hook，status/diff 订阅必须归属当前数据库。
**原最低场景**：未 enable、插件缺失、切分支、换库、多实例；不显示旧库 diff 或偷偷启用数据库能力。
**结论**：确认RV-069/P1：provider换库状态不归新库；其余初始化/显式命令边界已审。
hook没有自动status/diff订阅，不把“没有变更流”作为新bug。创建只构造core命令，不偷偷enable；缺provider抛错已由普通测试验证，缺插件守卫在core契约。换库则commands换新但十二格与稳定patch没有换归属，RV-069失败覆盖状态残留与迟到写回。

源码锚点：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts:64-77`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts:81-96`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/README.md:19-20`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/README.md:66-79`

已读测试定义锚点（不自动表示本轮新运行）：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/__tests__/use-working-tree.spec.tsx:74-97`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/__tests__/use-working-tree.spec.tsx:169-227`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/__tests__/review-parallel-provider-switch.spec.ts:11-58`

未验归属：SV-01, SV-02，见§5。

### C2 动作结果与并发 — 原源码意见已交付
**原动作**：逐项对照 commit/discard/restore 的返回值拒绝和 switchBranch 的异常，不能一律当异常或成功。
**原最低场景**：CAS 落败、dirty tree、不可达 commit、并发点击、动作中换 scope；原有数据不损坏。
**结论**：同库IO接缝上的结果/异常/刷新语义已证；动作中换scope存在RV-069同根因风险，真实数据库不损坏未验。
使用真实shared commands/async-state而非整个core状态机mock。CAS冲突与四种restore拒绝保留success/value；switchBranch dirty拒绝保留error并原样抛出。刷新失败只落statusState，不推翻已完成commit；这些断言的IO结果是手工mock，不证明真实CAS/恢复权限或数据完整性。

源码锚点：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts:31-38`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts:42-42`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts:89-95`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/README.md:70-79`

已读测试定义锚点（不自动表示本轮新运行）：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/__tests__/use-working-tree.spec.tsx:99-165`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/__tests__/use-working-tree.spec.tsx:229-448`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/__tests__/use-working-tree.spec.tsx:532-541`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/__tests__/review-parallel-provider-switch.spec.ts:38-58`

未验归属：SV-01, SV-02, SV-03，见§5。

### C3 三端与敏感数据 — 原源码意见已交付
**原动作**：核查更新触发、错误显示、diff 摘要和类型消费，并与 shared fixtures / 应用工作树场景对应。
**原最低场景**：相同拒绝序列三端同语义、关闭清理、敏感字段摘要；不能为调试直接输出完整历史。
**结论**：入口/共享类型及无隐式日志边界已审；敏感diff不是自动脱敏摘要，真实应用场景未验；有P3文档数量漂移。
三端根只导出useWorkingTree/WorkingTreeResource，核心类型/错误不转出是契约，不报缺失。React Resource直接复用core十二状态/十二命令；没有console、日志串行化或UI输出。core diff类型含patch/inversePatch，暴露为明确API而非摘要；RV-069使旧库此类状态可能残留是同根因风险推导，实测仅status/isEnabled。README仍称十，与真实声明/数量断言不符。

源码锚点：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/index.ts:1-19`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts:20-42`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts:69-74`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/README.md:52-82`

已读测试定义锚点（不自动表示本轮新运行）：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/__tests__/index.spec.ts:6-30`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/__tests__/use-working-tree.spec.tsx:458-556`

未验归属：SV-04，见§5。

### C4 React 生命周期与竞态 — 原源码意见已交付
**原动作**：核查 effect 的依赖/cleanup、稳定回调、闭包和请求代次；检查 StrictMode mount→cleanup→mount 与 provider/context 隔离。
**原最低场景**：StrictMode 双挂载、快速 props 变化、卸载后晚到结果、多个 root；状态不回流到旧实例。
**结论**：确认RV-069：同一React实例跨provider仍保留旧状态/写回sink；不泛化三框架或误归核心请求代次。
该hook只用useState/useCallback/useMemo，没有effect或Observable cleanup。core每commands实例的latest-only map能拦同一实例同一格的旧请求，但A/B各自map不撤销A共用patch的权限。函数式setState防跨格丢更新，不防跨库混入。正常spec没有StrictMode/多root；换库两条实际失败不是未跑候选。

源码锚点：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts:73-95`

已读测试定义锚点（不自动表示本轮新运行）：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/__tests__/use-working-tree.spec.tsx:53-72`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/__tests__/use-working-tree.spec.tsx:511-527`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/__tests__/review-parallel-provider-switch.spec.ts:11-58`

未验归属：SV-01, SV-05，见§5。

### C5 React 类型与 render 边界 — 原源码意见已交付
**原动作**：检查泛型 props/返回值、render 中副作用与对象稳定性，错误必须通过公开状态/回调传递。
**原最低场景**：typed consumer 编译、相同值不同引用、错误 props、重渲染；不通过 any、禁用 Hooks lint 或吞异常来过关。
**结论**：类型与render纯度/同库稳定引用成立；返回快照有RV-069归属错误，独立消费未验；P3文档误称十方法。
非泛型Resource由Readonly<WorkingTreeAsyncStates>&WorkingTreeCommands组合，签名/结果用核心类型；render不发IO，只读provider并构造命令。引用稳定仅同一db跨render承诺，换库更换commands正确，错在旧states与新commands被拼成同一快照。无any/禁Hooks/原测试skip的新过关手段。spec类型消费不代替真正打包独立typed/runtime消费。

源码锚点：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts:20-42`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts:81-96`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/index.ts:18-19`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/package.json:24-50`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/tsconfig.lib.json:11-39`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/tsconfig.spec.json:10-27`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/vite.config.mts:29-62`

已读测试定义锚点（不自动表示本轮新运行）：
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/__tests__/index.spec.ts:6-30`
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/__tests__/use-working-tree.spec.tsx:511-556`

未验归属：SV-03, SV-05, REL-01，见§5。

## 4. 动态证据 / 测试桩 / 配置限制

真实React/renderHook/RxDBProvider与共享createWorkingTreeCommands/async-state在测试里运行，只有workingTree/versionManager IO为官方vi.fn桩；不是整个core状态机mock，也没有真实SQL/CAS或错库落写。历史普通2文件49通过（46+3），四指标100%，实际仅11 statements/5 functions/8 lines，branches为0/0；薄包统计不证明竞态安全，且不含后来2条provider红探针。当前三个spec都被happy-dom glob纳入；它不是真实browser project。历史pack10文件只证明当时清单，不含新typed/runtime消费。源码use client不保证打包后RSC边界；React peer当前^19.3.0。根strict:true但skipLibCheck/skipDefaultLibCheck:true是既有，未降低设置也不包装独立不跳库检查消费已通过。构建pluginTimings:false为既有耗时诊断开关，不是ESLint零警告证据。缺插件守卫显式抛错；无自动status/diff订阅是公开约定。diff.entries含patch/inversePatch，wrapper不自动摘要/脱敏或打印历史。RV-069修法是绑定database identity重置状态并撤销旧sink写回，保留原Promise语义，不要求用户key、不新增fallback。

新增Nx命令：`[]`。旧coverage、lint/typecheck、pack不能称作本轮fresh通过，也不能代替真实场景。

## 5. 必要未验场景与发布owner

| ID / 原 C | owner（责任角色，实名由主控指定） | 场景 | 未验原因 |
| --- | --- | --- | --- |
| SV-01 / C1, C2, C4 | React working-tree维护者 | RV-069修复后A→B立即十二格初态、旧A查询/动作/status刷新晚到不能写B；原A Promise语义不改变 | 同SHA两条provider回归已红，本轮只复用确认，不改业务或反复复现；旧命令的作用域归属需由wrapper状态/sink identity修复，不靠消费者key或停止原Promise掩盖。 |
| SV-02 / C1, C2 | React工作树集成QA；核心working-tree维护者提供既有验收证据 | 未enable、缺插件、真实分支/多实例、CAS落败、dirty tree、不可达commit、并发点击及动作中换scope的数据不损坏 | 本包测试只控制IO返回；并未持有真正数据库、事务或CAS锁。核心已由其他agent全审，本轮只读必要契约，不重新跑核心/真UI大验收，也不把其全审等同本包集成已运行。 |
| SV-03 / C2, C5 | React工作树组件测试维护者 | enableIfEmpty、commitChanges动作的loading/empty或success/error、参数与结果透传；错误typed consumer正反例 | 现有两个方法仅被状态/成员及方法数量守卫覆盖，没有在本包执行对应IO动作的断言；presence不等于行为通过。该缺口不是生产缺陷确认。 |
| SV-04 / C3 | 三端工作树UI/隐私QA；核心数据治理维护者 | 同拒绝序列三端真实应用同语义、关闭清理、敏感字段摘要与多实例diff展示 | wrapper没有UI/摘要/日志逻辑；必要core类型表明diff条目携带patch/inversePatch，不能称自动脱敏摘要。fixture payload和根入口对照不证明真实UI日志/字段治理安全；RV-069可能让旧diff残留是同根因源码影响，不是另一个实测泄露。 |
| SV-05 / C4, C5 | React working-tree生命周期测试维护者 | StrictMode、快速provider/source变化、卸载后晚到结果、多个root、同库相同值/不同引用重渲染 | 正常spec验证同一库跨render的方法稳定，新增探针验证provider换库失败；没有StrictMode/多root/异步source完整生命周期动态证据。无Observable订阅可取消，不虚构unsubscribe通过。 |
| REL-01 / C5 | working-tree React包发布与类型消费维护者 | 独立tarball TS strict typed consumer、根ESM runtime import、React/core peer边界及打包use client/RSC消费 | 只读历史10文件pack，未执行新build/pack/发布大矩阵；source的use client不证明产物保留指令。根既有skipLibCheck:true不作为不跳过库检查的独立strict消费通过依据。 |

## 6. 最终收口

🔴：同SHA已证P1跨库状态残留及迟到覆盖，比单纯文档或未测风险严重；100%薄封装覆盖不能抵消P1。另有局部P3文档漂移，不影响主评级依据。
sourceReviewComplete=true / opinionDeliveryComplete=true；所有原C意见完成，scenario/release不冒充完成。
[plan](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/packages/rxdb-plugin-working-tree-react.md) / [file-inspection.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-working-tree-react/file-inspection.json) / [c-evidence.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-working-tree-react/c-evidence.json) / [closure.json](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-working-tree-react/closure.json)。
校验后使用指定进度脚本--complete；在完成事件与总进度/ETA原子更新之前不启动下一包。
