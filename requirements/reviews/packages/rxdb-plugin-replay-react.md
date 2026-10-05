---
kind: review-plan
object: rxdb-plugin-replay-react
source_root: packages/rxdb-plugin-replay-react
created: 2026-10-03
updated: 2026-10-05
worker: PKG-replay-react
execution: complete-original-scope
source-review: complete-original-scope
assessment-delivery: complete-original-scope
scenario-validation: remaining-owners-listed
release-validation: not-performed-this-pass
rating: '🟡'
---

# rxdb-plugin-replay-react：原范围全文评审收口计划

**源码全文评审与原 C 意见交付均为 complete-original-scope；专项运行与发布验收另列，不冒充已完成。** 本包单独交付，不批带其他包，不派 agent。

## 1. 冻结范围与去重基线

- 根：`/Users/jimmy/Documents/aiao/rxdb`；唯一全文对象：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react`。
- 冻结受控范围：**12 文件 / 545 行**，含源码、两个测试、文档、许可与所有包内配置。旧计划的 11 文件已由现有 scope 补进 layout 探针；忽略产物 dist/out-tsc 不冒充源码。
- scope 记载 head：`943c50cc85b4be3b0635f736a35a9659c3fe209a`。只沿用快照标识，实际阅读以当前逐文件 SHA 锁定，不自行执行 git 命令。
- scope 与 resolved Nx 配置 保持原冻结内容；冻结核对确认当前 12 文件 SHA、行数与其一致。resolved 全文先于包内 project.json 阅读，未将局部 targets 当完整配置。
- 已全文先读旧 plan/results，原文分别保存在 原计划、原结果。历史 partial 不删除，但不能继续冒充本次源码交付状态。
- 已先读 RV-070并核对关键输入同 SHA；旧 early-seek 候选归并此既有 P2，不重复编号或再跑真实 iframe。

## 2. 全文阅读登记

正文按实现、测试/入口、文档/许可/manifest、配置四组逐行输出，全部无截断；不是 hash 盘点。旧 plan/results 分片补齐。第一次历史全仓指纹输出截断后，已选择性补读本问题相关键，不声称全仓 manifest 全文阅读。

| 文件（全文）                                                                                                                          | 行数 | 具体关注                                                |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---: | ------------------------------------------------------- |
| [LICENSE](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/LICENSE)                                                 |   21 | 许可文本/manifest/历史pack对应                          |
| [README.md](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/README.md)                                             |   78 | 用例与加载前seek契约；RV-070                            |
| [package.json](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/package.json)                                       |   54 | 根exports、files排除及当前peer                          |
| [project.json](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/project.json)                                       |   12 | 原始覆盖与完整resolved的区别                            |
| [src/**tests**/replayer.spec.tsx](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/__tests__/replayer.spec.tsx) |   98 | 7条parity + 3条React用例；core整体mock                  |
| src/**tests**/review-parallel-layout-seek.spec.ts（已删除）                                                                           |   29 | 真实layout调用；既有同hash红证据                        |
| [src/index.ts](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/index.ts)                                       |   12 | 五符号及三端共享透传                                    |
| [src/replayer.tsx](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/src/replayer.tsx)                               |  102 | 输入delta、最新回调、cleanup、ref早于core               |
| [tsconfig.json](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/tsconfig.json)                                     |   16 | base继承/lib与spec引用                                  |
| [tsconfig.lib.json](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/tsconfig.lib.json)                             |   33 | 生产声明include/exclude/核心引用                        |
| [tsconfig.spec.json](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/tsconfig.spec.json)                           |   27 | 两个spec实际入类型检查范围                              |
| [vite.config.mts](/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-react/vite.config.mts)                                 |   63 | ES external/dts、happy-dom、测试glob、coverage/条件上传 |

逐文件实际 SHA、全文 readRanges、具体结论及 C 归属：file-inspection.json。依赖局部锚点单列 dependency-inspection.json，不把它们计为第二个包评审。

## 3. 原 C 动作与原最低场景不缩减

| 原 C                            | 原核查动作                                                                                                           | 原最低复验场景                                                                                        | 本次意见                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **C1 播放器挂载与按需依赖**     | 核查 wrapper 委托 mount-replayer 的输入、容器和 rrweb 懒加载；组件出现不等于授权录制。                               | 空 recording、加载失败、切 recording、双播放器、卸载；无多重 mount 或后台录制。                       | 源码意见已交付；确认既有RV-070；其余wrapper委托在源码/已读stub测试边界成立。                             |
| **C2 恢复交互与状态**           | 跟踪时间轴 marker 点击、restore callback、拒绝和 loading 状态，不私自改 HEAD。                                       | 不可达 commit、dirty tree、并发恢复、恢复中卸载；与 replay/working-tree 原 API 一致。                 | 源码意见已交付；源码层通过：只转发事件，无HEAD写入；真实恢复场景未测。                                   |
| **C3 三端可访问性与类型**       | 对照 replayer-parity fixture、公开 options/events、控件键盘与错误提示。                                              | 同 recording/marker 序列三端同结果、尺寸变化、键盘操作；不靠三份 demo 手动截图证明对称。              | 源码意见已交付；入口/共享类型与React adapter契约已对照；真实三端UI和可访问性未测。                       |
| **C4 React 生命周期与竞态**     | 核查 effect 的依赖/cleanup、稳定回调、闭包和请求代次；检查 StrictMode mount→cleanup→mount 与 provider/context 隔离。 | StrictMode 双挂载、快速 props 变化、卸载后晚到结果、多个 root；状态不回流到旧实例。                   | 源码意见已交付；确认RV-070时序缺陷；cleanup/refs/最新time回调在有限测试范围成立。                        |
| **C5 React 类型与 render 边界** | 检查泛型 props/返回值、render 中副作用与对象稳定性，错误必须通过公开状态/回调传递。                                  | typed consumer 编译、相同值不同引用、错误 props、重渲染；不通过 any、禁用 Hooks lint 或吞异常来过关。 | 源码意见已交付；公开声明/输入diff/render纯度已审；加载前seek文档契约由RV-070证实违背，独立消费仍未验证。 |

每 C 的实际源码/测试锚点、证明边界与未测原因见 [本包结果](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-plugin-replay-react.md) 和 c-evidence.json。原场景仍在上表；有 owner 的未验场景不改写成“不适用/通过”。本组件没有 Provider/context，provider 实现审查仅在此局部不适用。

## 4. 完成条件拆账

- [x] 全部原范围源码、配置、测试、doc/license 全文读完；12/12、545/545，不以目录/摘要替代正文。
- [x] 原 C1–C5 逐项意见、真实源码锚点及 stub/核心/真实 browser 的证明边界交付。
- [x] 确认问题与候选去重：复用 RV-070；0 新增确认、0 未收口候选。
- [x] 当前阅读 SHA 与冻结输入核对；历史动态证据和本次运行分离登记。
- [x] 🟡有真实 P2 风险依据；评审交付不等于修复或发布就绪。
- [ ] 原场景专项验收全部运行；责任角色/原因见下表。
- [ ] 修复 RV-070 后回归与独立 strict typed/runtime 消费、发布验收。

## 5. 专项 / 发布未验与 owner

| ID / 原 C          | 责任角色（待主控指定实名）                                 | 场景                                                                                                            | 未验原因                                                                                                                                              |
| ------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| SV-01 / C1, C4     | 核心Replay/rrweb视图维护者；React Replay维护者协作         | 空recording、readEvents/listCommitMarkers/rrweb加载失败、切session/replay、双播放器、卸载后的旧加载与无后台录制 | 本包tests把mountReplayer整体替换为同步spy；这里只能证明输入/update/destroy委托，不能证明真实读取、rrweb加载和异步取消。按用户要求不重复追真实iframe。 |
| SV-02 / C2         | 核心Replay与working-tree恢复维护者；React Replay维护者协作 | 真实marker点击、不可达commit、dirty tree、并发恢复、恢复中卸载及loading/拒绝/错误提示                           | 共享parity手工注入dirty_working_tree事件，仅验证同对象转发；core.restoreToCommit与UI实际交互未在本轮执行。                                            |
| SV-03 / C3         | 核心播放器UI维护者与Angular/React/Vue可访问性QA            | 同recording/marker序列三端同结果、尺寸变化、键盘控制与错误提示                                                  | 仅核对三端根共享导出及React驱动使用同一7条spy parity；没有实际rrweb DOM或三端UI/键盘运行，入口对称不等于完整可访问性。                                |
| SV-04 / C1, C4, C5 | React Replay维护者                                         | RV-070修复后：首次layout多次seek保留最新值；StrictMode、SSR/hydration、快速props变化、卸载后晚到结果与多个root  | RV-070已证但未修，不需要重复复现；现有StrictMode仅证明stub活句柄计数，未运行真实异步及多root。修复不能改变加载前play/pause空操作。                    |
| SV-05 / C4, C5     | React Replay组件测试维护者                                 | 恢复回调换新、相同原始输入重渲染无update、新身份replay仅update、错误props的正反类型用例                         | 源码delta比较及Effect Event说明委托方向；已读现有time回调换新/replay身份spy断言，不把未包含的恢复回调/相同值/错误类型场景包装成已测。                 |
| REL-01 / C5        | Replay React包发布与消费类型维护者                         | 独立tarball根ESM runtime import、TS strict typed consumer、peer React/core兼容边界及SSR消费                     | 历史pack仅有10文件记录和旧入口解析结论，本轮不重build/pack或跑发布大矩阵；根既有skipLibCheck:true不能作为关闭库检查后独立消费通过的证据。             |

## 6. 本轮执行纪律与交付

本轮**没有新增 Nx 验证命令**，没有重要新疑点需要另跑。只读并复用同 hash 的 RV-070 失败证据及历史 wrapper coverage/pack；没有全量 test/build、发布大矩阵、原测试/业务修改、降 strict、新增 skipLibCheck、any 或 skip。
本包 typecheck 依赖 build/^typecheck，test 依赖 ^build；因此不以“顺手跑门禁”为由扩展执行范围。未来若主控认定重要新疑点，必须走 `/tmp/rxdb-review-round3-locked.py --name packages-only-replay-react/<唯一名> --scope packages/rxdb-plugin-replay-react -- <单worker skipRemoteCache/skipNxCache命令>`，不直接启动任务。
结果：[results](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/packages/rxdb-plugin-replay-react.md)；机器收口：closure.json。本包完成后使用指定进度脚本校验并原子更新 50 包总进度/ETA。
