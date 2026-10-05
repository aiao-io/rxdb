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

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 本轮内容指纹清单。

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
| `lint`      | 本轮通过（限定当前配置/平台） | 执行日志      |
| `typecheck` | 本轮通过（限定当前配置/平台） | 执行日志 |
| `test`      | 本轮通过（限定当前配置/平台） | 执行日志      |
| `build`     | 本轮通过（限定当前配置/平台） | 执行日志     |

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

## 2026-10-05：parallel/core 实审交付

**execution: partial。原计划完整 C 核销为 0；下表“部分核销”只核销已实审子面，不勾原 C，也不等于业务修复/发布就绪。** 未读/必要未测明确保留，覆盖率和当前门禁通过不覆盖未审正文。

本轮基线 `44de1138b4d396fc45d6e76ab60476c40fef2223` + 当前工作区，2026-10-05（Asia/Shanghai）。scope 受控 287 文件；有正文审读记录 28 文件（全文 26、分段 2），不是整对象全文清单。新生成spec另记，不计作已审生产代码。逐区间/版本见 实际文件审读登记。

### 当前验证（只限其日期、输入与测量面）

- 2026-10-05 统一 strict lint、typecheck 均通过，缓存禁用、主控串行；typecheck包含51依赖任务。输入清单**不含本子任务晚加的4个spec**，不外推这些新文件门禁已绿。lint状态；typecheck状态。
- 本轮主控普通test：Test Files 1 failed | 119 passed (120)；Tests 1 failed | 948 passed (949)。原始执行日志。整批退出1不等于本对象全部失败，也不把失败测试算通过。
- 本轮测试失败，未取得可用于本包验收的四指标summary；覆盖率保持未完成，不能沿用旧产物。
- 2026-10-03/04 原日志、原SHA、原pass/skip继续保留为历史；不称作本轮。晚加 clone-array/teardown spec 的最终结果由主控 supplement 追加，本次写作未取得，不等队列空转。

### C 证据 / 结论表

| C   | 本轮实际审查所得 / 源码锚点                                                                                                                                                                                                                                                                                                          | 验证面                                                                                        | 核销结论                                     | 必要待证 / 下一批动作                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| C1  | `packages/utils/src/index.ts:17-206`、`packages/utils/src/@browser/index.ts:10-52`：逐个根 barrel 已辨识；polyfill 在函数调用内才写 window，pool 构造仅建 Map，不在导入时开 channel。                                                                                                                                                | 已读公开根及浏览器 barrel；统一 lint/typecheck 已执行。                                       | 部分核销：入口惰性子面。                     | 其它 barrel/全部叶子未读完；无打包后的 Node/浏览器/tree-shaking consumer 复验。                  |
| C2  | `packages/utils/src/async/AsyncQueueExecutor.ts:65-90,125-146,178-191`：拒绝只结算本任务，finally 推进队列；取消只清等待任务。`packages/utils/src/lifecycle/lifecycle-scope.ts:172-213` 逆序全收尾、单错原样、多错聚合、重复释放复用任务；setup 内关闭仍漏资源（候选1）。                                                            | 本轮 lifecycle 新 spec 1 failed/1 passed；旧队列/生命周期套件本轮运行，但未全篇审读。         | 部分核销：队列结算/幂等规则、候选1动态确认。 | 完整 C 还需关闭中排队、任务内再入队与取消后完成的逐场景对照；部分定时器/完整测试正文未审完。     |
| C3  | `packages/utils/src/@browser/broadcast-channel-pool.ts:53-83,123-132`：每 topic 独立 channel，关闭幂等，不添加自回声。`packages/utils/src/@browser/opfs-route-sync.ts:32-64`：init 成功后置位、finally 解锁，并发仅保最后目标。                                                                                                      | 上述实现全文已读，当前普通 suite 的通过不能充当两个真实 tab/页面卸载证据。                    | 部分核销：明确所有权和路由失败重试子面。     | leader-election、persisted-state 正文未读；存储拒绝/乱序/leader 退出真实浏览器面待证。           |
| C4  | `packages/utils/src/object/createStableKey.ts:1-54` 显式编码 BigInt、Date、hole/undefined/长度，拒绝循环/不识别宿主；`packages/utils/src/object/createQueryOptionsKey.ts:92-105` 仅按游标排序字段投影。`packages/utils/src/object/set.ts:1-19,25-47` 写前拒危险路径、拒不可写属性。cloneDeep 稀疏数组被 forEach+push 压缩（候选4）。 | 稳定键、路径写入和 cloneDeep 实现全文已读；候选4新 spec 尚待 supplement，不能声称失败已复现。 | 部分核销：稳定键/路径防护；候选4静态确定。   | clone/相等判断/路径转换全功能域和全部测试未审完；共享内建对象/完整跨框架 key 链未核销。          |
| C5  | `packages/utils/src/number/tryToNumber.ts:26-40` 保留不能转成有限数的原值；`packages/utils/src/date/msTimeToMilliseconds.ts:29-45` 数字不反向格式化、非法毫秒显式拒绝；parseTime 反向区间抛 RangeError，月/年明确近似，未误报成日历算法错误。                                                                                        | 对应正文已读；本轮整包其它测试通过不自动证明超安全整数/时区/Unicode/分数索引全部边界。        | 部分核销：有限数转换与日期工具实际契约。     | fractional-indexing、cron、中文/Unicode、完整排序与时区专题未审完，不能完整 C5。                 |
| C6  | `packages/utils/src/random/randomString.ts:12-17,27-50` 使用 getRandomValues + rejection sampling，缺安全源即抛；`packages/utils/src/crypto/getWebCrypto.ts:1-7` 不回退；base64Encode 分块避免全量重复复制。OPFS rename 校验后显式 NotSupportedError，不伪装成功。                                                                   | 上述正文已读；普通字符串/二进制工具不能等同加密算法审计。                                     | 部分核销：能力拒绝、随机来源和 Base64 分块。 | file、RSA/AES 全链及全部编码/巨型输入测试未读完；本轮失败未产出可验收的 utils coverage summary。 |

### 已闭环子面与仍未完成

下表不是再排一次计划：它记录已读实现、正常路径/反证、当前测试结果与确切缺口。**已闭环的是对应子面和门禁事实，不是未读的整 C。** 全对象收尾数仍为0；未完成条件主要是受控正文未全审、必要动态/真实消费或本包验收缺口。

候选问题及最小修法/回归见 4个待主控去重编号候选；不自分RV、不改现有报告。请求与已完成/待补测边界见 原验证请求、当前验证核对。
