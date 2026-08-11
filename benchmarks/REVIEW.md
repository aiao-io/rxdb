# `@aiao/benchmarks` 代码评审

## 结论

🔴 不通过。基准测试的“白名单”会误删同源数据，清理失败又被伪装成成功；构建中的裸 `tsc` 基本没有执行项目类型检查，主 CI 还排除了整个项目。这样的基准结果不可重复，也不可信。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：`benchmarks` 下存储清理、基准运行/分析源码、Vite/Vitest/TypeScript 配置和 Nx targets
- 自动校验：本轮仅执行静态只读审查，未单独运行 benchmark、测试、类型检查或构建任务
- 测试现状：存在分析与工具 spec，但根 `test-all` 排除 `benchmarks`，覆盖率默认关闭且统计范围不覆盖核心运行路径

## 问题

| ID | 级别 | 位置 | 问题与影响 | 建议 |
| --- | --- | --- | --- | --- |
| BENCHMARKS-001 | P1 | `src/clear-db.ts:10` | 所谓存储白名单只是 `/benchmark/i`。任何同源 OPFS 顶层条目或 IndexedDB 库只要名称包含 `benchmark` 就会被删除，与注释宣称的“仅删除 benchmark 自己创建的数据”不符。文档站或其他 demo 的合法数据可能被误删。 | 使用唯一、版本化且完整的自有前缀，并维护本次运行实际创建的存储清单；删除前做严格前缀/结构校验。补充相似名称不得删除的负向测试。 |
| BENCHMARKS-002 | P1 | `src/clear-db.ts:47`、`src/clear-db.ts:90` | IndexedDB `deleteDatabase()` 的 `onblocked` 被当作成功 resolve，随后 `Promise.allSettled()` 的 rejected 结果也被完全忽略，最后仍打印“清理完成”。旧连接和旧数据会污染所谓 fresh database 测量，使结果失真且无法被调用方察觉。 | `onblocked` 必须超时失败并报告阻塞库；检查 `allSettled` 结果，只要一个清理失败就中止本轮基准。记录并验证清理后的数据库/目录确实不存在。 |
| BENCHMARKS-003 | P1 | `package.json:9`、`project.json:14`、`tsconfig.json:6` | `build` 和 `build-website` 都执行裸 `tsc`，但根 tsconfig 是 `files: []`、`include: []` 的 solution 配置。未使用 `tsc -b` 或专用 `tsconfig.typecheck.json` 时，核心源码基本没有被类型检查；根 CI 又排除 benchmarks，构建成功是假的质量信号。 | 所有构建 target 显式执行 `tsc -p tsconfig.typecheck.json --noEmit`，或正确使用 project references 的 `tsc -b`；增加独立 Nx `typecheck` target 并纳入 CI。 |
| BENCHMARKS-004 | P2 | `vite.config.mts:107` | coverage 明确 `enabled: false`，即使手动开启也只统计 `src/analysis/**` 和 `src/utils/**`。存储清理、运行器、适配器编排等高风险路径不在覆盖率门禁内。 | 建立可执行的 coverage target，覆盖所有业务源码；无法在 Node 环境运行的浏览器存储逻辑使用 Playwright/浏览器 Vitest，整体达到 80% 门槛。 |

## 其余观察 / 测试缺口

- `clearDB()` 缺少“相似名称保留”“blocked 删除失败”“部分清理失败中止”和“清理后验证为空”的测试。
- `navigator.locks` 不可用、OPFS 失败与 IndexedDB 枚举异常分支没有形成可信的基准前置条件。
- 当前测试集中在分数计算和工具函数，不能证明端到端基准运行是隔离、可重复的。

## 验收条件

- 清理逻辑只删除当前基准明确拥有的存储；任何阻塞或删除失败都让本轮基准失败，而不是继续出报告。
- Nx 提供可发现的 `typecheck`、`test`、`coverage` 和 `build` targets，并全部纳入主 CI。
- 覆盖率达到 80% 以上，至少包含 `clear-db.ts` 的浏览器环境回归测试。
