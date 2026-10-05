---
kind: review-plan
object: rxdb-plugin-working-tree-react
source_root: packages/rxdb-plugin-working-tree-react
updated: 2026-10-05
worker: PKG-working-tree-react
execution: complete-original-scope
source-review: complete-original-scope
assessment-delivery: complete-original-scope
scenario-validation: remaining-owners-listed
release-validation: not-complete
rating: '🔴'
---

# rxdb-plugin-working-tree-react：原范围全文评审收口

**🔴 状态ownership不合格：RV-069/P1 Open使数据库身份切换后仍显示并接收旧库状态。源码全文 / 原 C 意见：complete-original-scope；专项运行与发布验收另列。**

## 1. 独占范围 / 冻结 / 历史

- 唯一对象：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react`；13 文件 / 1088 行，源码/config/tests/docs/license 全范围。
- 沿用冻结scope标识 `943c50cc85b4be3b0635f736a35a9659c3fe209a`；实际阅读以当前文件SHA及真实区间为准，不自行执行Git操作。
- scope / resolved / 冻结核对；没有把project.json局部targets当完整配置。
- 旧文档先读并保留：旧plan / 旧results；旧partial不能继续冒充本次源码状态，原场景仍保留。
- 全文台账记录实际SHA、N、真实readRanges、具体notes/C；输出trace与hash盘点不自动等于阅读。

## 2. 全文阅读与具体关注

| 文件                                                                                                                                                        | 行数 | 已审具体关注                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [LICENSE](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/LICENSE)                                                                 |   21 | MIT许可全文及署名；package.json:18声明MIT，历史pack含LICENSE。只核对声明对应，不作法律意见。                                                                                                                                                                                                                                                                                                                                                 |
| [README.md](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/README.md)                                                             |   91 | 全文91行：core插件装载必须先于connect；无自动变更流、显式status刷新、CAS/restore返回值与switchBranch异常有说明。52–54及66仍称十个状态/十个方法/十格，与当前十二字段及十二命令不符，记本地P3文档意见；不新增RV号。没有真实consumer或UI验收。                                                                                                                                                                                                  |
| [package.json](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/package.json)                                                       |   60 | 全文60行：root types/import/default均在dist，files排除spec/test/**tests**/tsbuildinfo；core/rxdb/react绑定peer齐，React当前^19.3.0而非旧计划^19.2.8，rxjs^7.8.2。只承诺ESM，无本轮pack或独立消费。                                                                                                                                                                                                                                           |
| [project.json](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/project.json)                                                       |   12 | 全文12行：只覆盖typecheck对build/^typecheck依赖；已先读冻结resolved完整310行，不能把局部targets当完整配置；未执行Nx。                                                                                                                                                                                                                                                                                                                        |
| [src/**tests**/index.spec.ts](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/__tests__/index.spec.ts)                         |   30 | 全文30行：3条用例实际namespace import入口，确认运行时仅useWorkingTree；WorkingTreeResource类型可具名而非运行时符号。核心类型/错误不再导出是明确契约，不报成缺失。                                                                                                                                                                                                                                                                            |
| src/**tests**/review-parallel-provider-switch.spec.ts（已删除）                                                                                             |   58 | 全文58行：真实renderHook/RxDBProvider，官方testing IO桩；两条A→B回归分别要求B初态idle、A迟到true不覆盖B false。历史日志两条均失败，关键输入同SHA，归并RV-069/P1/Open；不重复报号，不声称向错库落写。                                                                                                                                                                                                                                         |
| [src/**tests**/use-working-tree.spec.tsx](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/__tests__/use-working-tree.spec.tsx) |  556 | 全文556行五个实际区间：真实hook/provider/共享createWorkingTreeCommands与async-state，只把workingTree/versionManager IO打桩。覆盖loading、查询empty、CAS/四种restore拒绝作为success、switchBranch抛错与选项透传、显式status刷新、刷新失败不翻转成功commit、无provider抛错及十二格/十二方法稳定引用。enableIfEmpty/commitChanges只在状态/成员面出现，没有对应动作执行断言；不把presence guard当动作通过。无StrictMode/多root/真实SQL CAS验收。 |
| [src/index.ts](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/index.ts)                                                       |   19 | 全文19行：use client源指令，运行时只导出useWorkingTree、类型只导出WorkingTreeResource；核心错误/类型让用户从peer核心根取。与API baseline及另外两端根入口一致；不检查忽略dist或凭source指令保证打包RSC边界。                                                                                                                                                                                                                                  |
| [src/use-working-tree.ts](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts)                                 |   96 | 全文96行：Resource是Readonly<core states>&core commands，无重复签名；创建不发IO、无自动Observable订阅、同库useMemo命令稳定。84–95命令因database变而重建，85的useState与89–92稳定patch却跨database复用，形成旧状态+新命令混合快照且旧命令晚到仍写当前状态，根因复用RV-069。1–3旧十格注记与20–21十二格/十二命令有文档漂移；不把核心每commands实例请求代次当数据库ownership屏障。                                                               |
| [tsconfig.json](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/tsconfig.json)                                                     |   16 | 全文16行：继承base，lib/spec两引用；ignoreDeprecations:6.0既有兼容项。本轮未改严格选项；根strict:true且既有skipLibCheck/skipDefaultLibCheck:true，不能当独立不跳库检查的消费验证。                                                                                                                                                                                                                                                           |
| [tsconfig.lib.json](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/tsconfig.lib.json)                                             |   39 | 全文39行：ts/tsx生产声明，排除所有spec/test及构建配置和生成目录；引用core/rxdb-react/rxdb三个lib。lib入口通过不等于三个spec或独立consumer通过。                                                                                                                                                                                                                                                                                              |
| [tsconfig.spec.json](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/tsconfig.spec.json)                                           |   27 | 全文27行两个实际区间：ts/tsx测试与vite配置都在include，引用本包lib；provider-switch探针未被排除。无本轮spec编译，旧compiler.txt仅命令文本。                                                                                                                                                                                                                                                                                                  |
| [vite.config.mts](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-working-tree-react/vite.config.mts)                                                 |   63 | 全文63行：ES入口+dts及aiao/react/jsx-runtime/rxjs外置，CI/token条件上传插件；happy-dom而非browser，glob含三个spec，v8/include src。既有pluginTimings:false只抑制构建耗时诊断，不是ESLint零警告证据。本轮不build、不关闭检查。                                                                                                                                                                                                                |

## 3. 原 C 全部意见

| 原 C / 专项                     | 原动作                                                                                                               | 原最低场景（不缩减）                                                                                  | 当前源码意见                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **C1 状态与作用域**             | 核查 activation/branch/能力状态如何进入 hook，status/diff 订阅必须归属当前数据库。                                   | 未 enable、插件缺失、切分支、换库、多实例；不显示旧库 diff 或偷偷启用数据库能力。                     | 确认RV-069/P1：provider换库状态不归新库；其余初始化/显式命令边界已审。                            |
| **C2 动作结果与并发**           | 逐项对照 commit/discard/restore 的返回值拒绝和 switchBranch 的异常，不能一律当异常或成功。                           | CAS 落败、dirty tree、不可达 commit、并发点击、动作中换 scope；原有数据不损坏。                       | 同库IO接缝上的结果/异常/刷新语义已证；动作中换scope存在RV-069同根因风险，真实数据库不损坏未验。   |
| **C3 三端与敏感数据**           | 核查更新触发、错误显示、diff 摘要和类型消费，并与 shared fixtures / 应用工作树场景对应。                             | 相同拒绝序列三端同语义、关闭清理、敏感字段摘要；不能为调试直接输出完整历史。                          | 入口/共享类型及无隐式日志边界已审；敏感diff不是自动脱敏摘要，真实应用场景未验；有P3文档数量漂移。 |
| **C4 React 生命周期与竞态**     | 核查 effect 的依赖/cleanup、稳定回调、闭包和请求代次；检查 StrictMode mount→cleanup→mount 与 provider/context 隔离。 | StrictMode 双挂载、快速 props 变化、卸载后晚到结果、多个 root；状态不回流到旧实例。                   | 确认RV-069：同一React实例跨provider仍保留旧状态/写回sink；不泛化三框架或误归核心请求代次。        |
| **C5 React 类型与 render 边界** | 检查泛型 props/返回值、render 中副作用与对象稳定性，错误必须通过公开状态/回调传递。                                  | typed consumer 编译、相同值不同引用、错误 props、重渲染；不通过 any、禁用 Hooks lint 或吞异常来过关。 | 类型与render纯度/同库稳定引用成立；返回快照有RV-069归属错误，独立消费未验；P3文档误称十方法。     |

逐项源码/测试角色及未验归属：[results](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-plugin-working-tree-react.md) / c-evidence.json。

## 4. 完成条件拆账

- [x] 原受控全范围正文与所有原 C 意见交付，非目录/摘要检查。
- [x] 确认问题去重、当前指纹/原失败证据与未测边界分离。
- [x] 有证据的评级；源码评审完成不等于修复或发布就绪。
- [x] 全部必要未验场景的owner/场景/原因登记。
- [ ] 专项场景全部运行通过。
- [ ] 修复回归、独立consumer与发布验收。

## 5. 专项 / 发布剩余验证

| ID / 原 C          | owner（责任角色，实名由主控指定）                         | 场景                                                                                                      | 未验原因                                                                                                                                                                                                                |
| ------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SV-01 / C1, C2, C4 | React working-tree维护者                                  | RV-069修复后A→B立即十二格初态、旧A查询/动作/status刷新晚到不能写B；原A Promise语义不改变                  | 同SHA两条provider回归已红，本轮只复用确认，不改业务或反复复现；旧命令的作用域归属需由wrapper状态/sink identity修复，不靠消费者key或停止原Promise掩盖。                                                                  |
| SV-02 / C1, C2     | React工作树集成QA；核心working-tree维护者提供既有验收证据 | 未enable、缺插件、真实分支/多实例、CAS落败、dirty tree、不可达commit、并发点击及动作中换scope的数据不损坏 | 本包测试只控制IO返回；并未持有真正数据库、事务或CAS锁。核心已由其他agent全审，本轮只读必要契约，不重新跑核心/真UI大验收，也不把其全审等同本包集成已运行。                                                               |
| SV-03 / C2, C5     | React工作树组件测试维护者                                 | enableIfEmpty、commitChanges动作的loading/empty或success/error、参数与结果透传；错误typed consumer正反例  | 现有两个方法仅被状态/成员及方法数量守卫覆盖，没有在本包执行对应IO动作的断言；presence不等于行为通过。该缺口不是生产缺陷确认。                                                                                           |
| SV-04 / C3         | 三端工作树UI/隐私QA；核心数据治理维护者                   | 同拒绝序列三端真实应用同语义、关闭清理、敏感字段摘要与多实例diff展示                                      | wrapper没有UI/摘要/日志逻辑；必要core类型表明diff条目携带patch/inversePatch，不能称自动脱敏摘要。fixture payload和根入口对照不证明真实UI日志/字段治理安全；RV-069可能让旧diff残留是同根因源码影响，不是另一个实测泄露。 |
| SV-05 / C4, C5     | React working-tree生命周期测试维护者                      | StrictMode、快速provider/source变化、卸载后晚到结果、多个root、同库相同值/不同引用重渲染                  | 正常spec验证同一库跨render的方法稳定，新增探针验证provider换库失败；没有StrictMode/多root/异步source完整生命周期动态证据。无Observable订阅可取消，不虚构unsubscribe通过。                                               |
| REL-01 / C5        | working-tree React包发布与类型消费维护者                  | 独立tarball TS strict typed consumer、根ESM runtime import、React/core peer边界及打包use client/RSC消费   | 只读历史10文件pack，未执行新build/pack/发布大矩阵；source的use client不证明产物保留指令。根既有skipLibCheck:true不作为不跳过库检查的独立strict消费通过依据。                                                            |

## 6. 执行纪律 / 交付

本轮新增Nx命令：`[]`。不业务/原tests/deps/index/Git操作，不派agent，不apps或扩全矩阵。旧明确同SHA证据只按其真实证明面复用。
重要新动态疑点才经指定locked脚本执行唯一包、单worker、skipRemoteCache/skipNxCache复验；不降strict、不新增skipLibCheck/any/skip，不以全量门禁拖住源码意见收口。
机器收口：closure.json；校验后执行指定--complete原子更新50包总进度/ETA。
