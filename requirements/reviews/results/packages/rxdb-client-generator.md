---
kind: review-execution
object: rxdb-client-generator
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-client-generator：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

从实体与插件元数据生成类型安全客户端、repository 和规则；含 CLI、浏览器 AST 与构建插件。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts`](../../../../packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts)
- [`packages/rxdb-client-generator/src/core/generated-symbols.ts`](../../../../packages/rxdb-client-generator/src/core/generated-symbols.ts)
- [`packages/rxdb-client-generator/src/cli/cli.ts`](../../../../packages/rxdb-client-generator/src/cli/cli.ts)
- [`packages/rxdb-client-generator/src/cli/cli.interface.ts`](../../../../packages/rxdb-client-generator/src/cli/cli.interface.ts)
- [`packages/rxdb-client-generator/src/cli/out-dir.ts`](../../../../packages/rxdb-client-generator/src/cli/out-dir.ts)
- [`packages/rxdb-client-generator/src/generators/entity-rules.ts`](../../../../packages/rxdb-client-generator/src/generators/entity-rules.ts)
- [`packages/rxdb-client-generator/package.json`](../../../../packages/rxdb-client-generator/package.json)
- [`packages/rxdb-client-generator/project.json`](../../../../packages/rxdb-client-generator/project.json)
- [`packages/rxdb-client-generator/src/index.ts`](../../../../packages/rxdb-client-generator/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 输入元数据到 AST：从实体字段、关系、继承、泛型和插件 generator 跟踪到生成 AST，核查非法元数据拒绝位置。
- [ ] C2 公开类型保真：对照核心与三框架 API，核查 import 路径、类型擦除与公开方法归属。
- [ ] C3 确定性与增量：核查符号排序、重复生成、陈旧文件清理和产物写入；确保输入不变时结果稳定。
- [ ] C4 CLI 与 Vite 路径基准：分别核查配置目录相对路径、cwd 相对路径、glob、outDir 与构建缓存输入；不得自行统一已有行为。
- [ ] C5 Node / 浏览器边界：审查 ts-morph-browser、CLI/shebang 与子路径构建；浏览器入口不能静态拉入 Node 文件系统。
- [ ] C6 样例与发布契约：将 README 样例、公开 API baseline 和实际 pack 文件逐一对照，检查插件 generator 的导出闭合。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-04：生成器、图与小程序第四批深审

整包先行 **38 files /371 passed**：[基线](../../evidence/2026-10-04/generator-graph-miniprogram/rxdb-client-generator-baseline.txt)。人工检查输入分析到 getSourceFiles、输出 containment/staging/manifest/stale cleanup 与队列身份。新队列排序不被既有“输出目录已存在”的 soft-link 绿覆盖。

生成输出目前是校验过的实体 leaf/barrel 文件名；没有把“新输出穿过任意父 symlink”初步猜测报成已证实写越界。JSDoc renderer 已转义 comment terminator/多种换行，模板插值字符串也有既有 inert metadata 反证；未凭看见 displayName 就生成注入漏洞报告。所有公开类型/发布 consumer/浏览器完整测量面仍待逐项核销，C1/C2/C4/C5/C6 不批量打勾。

## 2026-10-05：parallel/core 实审交付

**execution: partial。原计划完整 C 核销为 0；下表“部分核销”只核销已实审子面，不勾原 C，也不等于业务修复/发布就绪。** 未读/必要未测明确保留，覆盖率和当前门禁通过不覆盖未审正文。

本轮基线 `44de1138b4d396fc45d6e76ab60476c40fef2223` + 当前工作区，2026-10-05（Asia/Shanghai）。scope 受控 77 文件；有正文审读记录 12 文件（全文 10、分段 2），不是整对象全文清单。新生成spec另记，不计作已审生产代码。逐区间/版本见 [实际文件审读登记](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/core/file-inspection.json)。

### 当前验证（只限其日期、输入与测量面）

- 2026-10-05 统一 strict lint、typecheck 均通过，缓存禁用、主控串行；typecheck包含51依赖任务。输入清单**不含本子任务晚加的4个spec**，不外推这些新文件门禁已绿。[lint状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json)；[typecheck状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json)。
- 本轮主控普通test：Test Files 1 failed | 39 passed (40)；Tests 2 failed | 374 passed (376)。[原始执行日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt)。整批退出1不等于本对象全部失败，也不把失败测试算通过。
- 本轮测试失败，未取得可用于本包验收的四指标summary；覆盖率保持未完成，不能沿用旧产物。
- 2026-10-03/04 原日志、原SHA、原pass/skip继续保留为历史；不称作本轮。晚加 clone-array/teardown spec 的最终结果由主控 supplement 追加，本次写作未取得，不等队列空转。

### C 证据 / 结论表

| C   | 本轮实际审查所得 / 源码锚点                                                                                                                                                                                                                                                               | 验证面                                                                                                                   | 核销结论                                     | 必要待证 / 下一批动作                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| C1  | `packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts:82-83,111-178,276-306,403-415,445-475`：元数据键是 JSON 元组；标识符、同名实体、barrel 碰撞、getter 冲突在发布 project 前校验；many-to-many 对端必须指回本端。                                                            | 本轮 374 passed/2 failed；glob 两红来自新 spec，不否定其它已通过场景；元数据→AST 主类全文审读。                          | 部分核销：输入拒绝和项目替换边界。           | analyze-file、完整 AST renderer、关系/规则/继承/泛型生成叶子及对应测试未全读；未完整核销所有 C1 最低场景。   |
| C2  | `packages/rxdb-client-generator/src/generators/entity-properties.ts:94-119`：计算属性不进 InitData；readonly 传到声明；split augmentation 使用 typeof import，sibling import 为 type-only；不会仅靠字符串 export 声称类型等价。                                                           | 统一69对象 typecheck包含消费者/依赖构建；已读生成属性和主类，不把整个 typecheck 当作生成类型所有负例的证明。             | 部分核销：已读的字段和 split 类型出口。      | 规则/关系/Repository 公开方法及 TS 负例未逐一审；三框架真实消费/现有 API 对照未完整核销。                    |
| C3  | `packages/rxdb-client-generator/src/cli/build-client-lib.ts:44-53,80-185,258-305`：输出词法 containment、manifest 去重、stale 软链拒绝、先校验/后 staging/manifest 最后提交；RV-049 最近存在祖先 realpath 的修法已读。单文件 rename 原子不等于整套提交事务，源码已承认提交中途 I/O 风险。 | 实现全文已读；当前对应旧 spec 被执行，未把 2026-10-04 38 files/371 passed 当本轮。                                       | 部分核销：已追 RV-049 修法与写入安全边界。   | 新 alias 回归全文/两次生成+删实体+I/O 拒绝全验证面未读全；跨进程/提交段半套风险不能以队列或 staging 绿抹掉。 |
| C4  | `packages/rxdb-client-generator/src/cli/cli.ts:28-109` CLI 按配置目录归一；`packages/rxdb-client-generator/src/plugins/vite.ts:74-85,102-140` 明确保留宿主 cwd 锚点，串行重建并报告错误。find-files 只判断 * / ?，字符类/花括号失败（候选2）。                                            | cli.spec.ts 和真实 Vite integration spec 全文已读；本轮 glob 2 failed/1 passed；星号正常，不能把所有 glob 判坏。         | 部分核销：两种路径基准和 glob 失败面已确认。 | 含空格/从不同 cwd 的全部最小复验与 repository-generators 测试正文未核完；因此不擅自勾完整 C4。               |
| C5  | `packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts:1-32,403-425`：内存生成器不写盘；Node fs 在 CLI/Vite 写盘端，不能因为根入口提到 CLI 就猜浏览器必静态引 fs。                                                                                                               | 构建/typecheck本轮有证据；当前 tests environment=node，真实 Vite integration 是 Node 调构建/服务器，不是浏览器页面生成。 | 部分核销：内存/文件系统职责边界。            | ts-morph-browser 全文、根导出递归闭合、离线真实页面、打包 CLI/bin/子路径 consumer 未完整核销。               |
| C6  | `packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts:725-747`：split barrel 仅 re-export，避免 TS2459；`packages/rxdb-client-generator/src/plugins/vite.ts:93-98` 首次解析前生成。                                                                                             | 本轮真实 Vite build/import 和连续改字段测试通过；这是工作区集成，不是实际 pack 的全部子路径承诺。                        | 部分核销：首次生成消费和 split 出口。        | README、API baseline、pack 文件和插件 generator 导出全集未逐条对照；失败轮没有本轮完整四指标报告。           |

### 已闭环子面与仍未完成

下表不是再排一次计划：它记录已读实现、正常路径/反证、当前测试结果与确切缺口。**已闭环的是对应子面和门禁事实，不是未读的整 C。** 全对象收尾数仍为0；未完成条件主要是受控正文未全审、必要动态/真实消费或本包验收缺口。

候选问题及最小修法/回归见 [4个待主控去重编号候选](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/core/findings.pending.md)；不自分RV、不改现有报告。请求与已完成/待补测边界见 [原验证请求](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/core/validation-requests.json)、[当前验证核对](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/core/validation-reconciliation.json)。
