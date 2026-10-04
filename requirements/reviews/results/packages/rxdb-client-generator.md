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
