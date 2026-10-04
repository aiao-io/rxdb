---
kind: review-execution
object: utils
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# utils：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

供整个工作区复用的类型、异步、生命周期、浏览器存储、文件和数据工具。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/utils/src/index.ts`](../../../../packages/utils/src/index.ts)
- [`packages/utils/src/async/AsyncQueueExecutor.ts`](../../../../packages/utils/src/async/AsyncQueueExecutor.ts)
- [`packages/utils/src/lifecycle/lifecycle-scope.ts`](../../../../packages/utils/src/lifecycle/lifecycle-scope.ts)
- [`packages/utils/src/@browser/broadcast-channel-pool.ts`](../../../../packages/utils/src/@browser/broadcast-channel-pool.ts)
- [`packages/utils/src/object/createQueryOptionsKey.ts`](../../../../packages/utils/src/object/createQueryOptionsKey.ts)
- [`packages/utils/src/indexing/fractional-indexing.ts`](../../../../packages/utils/src/indexing/fractional-indexing.ts)
- [`packages/utils/package.json`](../../../../packages/utils/package.json)
- [`packages/utils/project.json`](../../../../packages/utils/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：RV-033（已修复，记录已删除）

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 全功能域清点：按 src/index.ts 的每个 barrel 逐个核查，不只看被当前应用调用的工具；检查包根导入是否触碰浏览器全局或制造副作用。
- [ ] C2 队列与资源生命周期：审查异步队列、取消、超时、scope cleanup 的错误传播和幂等性；检查队列中的失败是否拖死后续任务。
- [ ] C3 跨标签页与持久化：核查广播池、leader election、持久状态与 OPFS 路由同步的身份隔离和清理。
- [ ] C4 对象与稳定键：检查深拷贝、对象路径、查询键序列化、相等判定和输入修改；明确不支持的数据形态，防止原型污染。
- [ ] C5 数值、文本与排序：检查数值转换、日期、中文/Unicode、分数索引的精度与边界，避免把便利转换当作验证。
- [ ] C6 文件、编码与随机性：逐项核查 file/binary/crypto/random 工具的能力声明和调用者；区分普通随机与安全随机。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。
