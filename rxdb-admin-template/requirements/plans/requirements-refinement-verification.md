# 全量需求评审整改复核

日期：2026-11-16。评审基线：`85b23a7b2335dd44d188e960a57dbfa97c9a5c14`。范围为产品 `requirements/` 原有 51 份文件及本次新增共享契约、复核记录；14 条协作故事的 AC 从原有规则扩展和细化，产品 AC 总数由 129 增至 161；三个历史 JSON 证据已逐字节核对，保留原值。本轮修订需求与性能复验工具，不实施协作运行时，也不推进故事状态。

## 问题到验收标准

| 发现                         | 修订与验证入口                                                                                                                                                                                                                                                                                                                                         | 实施时必须证明的反例                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| F01 · 批准未覆盖最终冲突值   | [共享契约 C04/C06](../collaboration-contract.md)；[209](../stories/collaboration/ADMIN-US-209-review-approval.md) #1/#3、[210](../stories/collaboration/ADMIN-US-210-diff-checks.md) #7/#8、[211](../stories/collaboration/ADMIN-US-211-three-way-conflict-preview.md) #8、[212](../stories/collaboration/ADMIN-US-212-authorized-atomic-merge.md) #11 | 已批准价格120，再改为999而来源头不变；旧检查和批准必须无法合并999                |
| F02 · 同任务双设备分叉       | [206](../stories/collaboration/ADMIN-US-206-draft-sync-offline-recovery.md) #2/#4/#8/#9、C03                                                                                                                                                                                                                                                           | 两设备从同一头提交不同内容，只有一个推进原任务；另一个完整保留并可幂等另存       |
| F03 · 共享数据直写绕过 PR    | [203](../stories/collaboration/ADMIN-US-203-permission-server-isolation.md) #5/#8、[212](../stories/collaboration/ADMIN-US-212-authorized-atomic-merge.md) #10、C06                                                                                                                                                                                    | 管理员/合并者对共享表直接插入、更新、删除也被拒绝                                |
| F04 · 保存到提交之间缺少规则 | [205](../stories/collaboration/ADMIN-US-205-task-draft-continuous-editing.md) #4/#5/#8/#9、[206](../stories/collaboration/ADMIN-US-206-draft-sync-offline-recovery.md) #1/#10/#11、C02                                                                                                                                                                 | 上传 S 时继续编辑不能修改 S；回执不能把新修改标为已同步，空同步不制造提交        |
| F05 · 邀请身份和消费未定义   | [202](../stories/collaboration/ADMIN-US-202-team-membership-workspace.md) #1/#4/#6～9、C01                                                                                                                                                                                                                                                             | 错账号不消耗邀请；重发旧令牌、并发接受/撤销和移除后重放不得恢复成员              |
| F06 · 首个团队无入口         | [202](../stories/collaboration/ADMIN-US-202-team-membership-workspace.md) #10/#11、C01                                                                                                                                                                                                                                                                 | 空环境可可信初始化，重复不重建、中途失败回滚；普通首位登录者不能抢占管理员       |
| F07 · 多人审核聚合不明       | [209](../stories/collaboration/ADMIN-US-209-review-approval.md) #5～12、C05                                                                                                                                                                                                                                                                            | A 要求修改、B 批准仍阻塞；移除 A 不静默清除阻塞；免审批也不能跳过                |
| F08 · 离线与退出边界混淆     | [201](../stories/collaboration/ADMIN-US-201-supabase-email-otp-session.md) #4～9、[204](../stories/collaboration/ADMIN-US-204-local-context-explicit-import.md) #4/#5/#7、C01                                                                                                                                                                          | 热续作可保存；过期冷启动/主动退出锁定；账号 B 不能读取或上传 A 的队列            |
| F09 · 旧基线无法复验         | [性能复验步骤](dashboard-performance-verification.md)、[布局测试](../../apps/react/scripts/dashboard-profile-layout.spec.mjs)                                                                                                                                                                                                                          | 仅有旧布局仍能运行；选错布局或缺入口在启动浏览器前失败，不自动兜底测另一版本     |
| F10 · 派生视图互相矛盾       | [路线图](../roadmap.md)、[验收台账](../verification-report.md)、[优化清单](nexus-template-optimization-tasks.md)、[国际化记录](client-i18n-verification.md)、[计划索引](README.md)                                                                                                                                                                     | T04/T05 已本地验证；102 已本地验收待合并；2/5 明确为历史批次，当前统计由故事派生 |

## 规则取舍

- 首版同任务分叉采用拒绝覆盖及另存新任务，不提前增加另一套自动合并引擎；任务对共享分支的三方处理仍由 211 实施。
- 默认要求至少一名非作者审核者批准；管理员可通过有审计的策略变更启用免审批，但无法绕过阻塞意见、检查或共享表禁写。
- 候选包含最终结果与规则版本。210/211 先完成差异、检查和候选链路，209 再验收批准，`dependsOn` 已反映此顺序。
- 离线热续作保留已解锁任务；过期冷启动和显式退出锁定内容但保留草稿。保留既有匿名本机模式，不自动接入团队。
- 202 承担可信初始化，不新增自助组织管理 UI。初始化只建立空分支及治理元数据，真实业务导入仍走任务和 PR。

## 本轮校验

性能布局回归先红后绿：新增测试最初因缺少布局模块失败，补齐显式解析和文件预检后通过。测试使用临时文件树，覆盖 Angular/React/Vue × product/legacy 六组入口，以及未知布局、未知框架、错布局和缺少活动源四组负例。`test-profile` 已加入 React `test` 前置，后续可持续复验。

从仓库根运行：

```bash
NX_NO_CLOUD=true pnpm nx run-many -p rxdb-admin-template -t requirements-check requirements-test --parallel=1 --skipNxCache --output-style=static
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template-react:test-profile --skipRemoteCache --output-style=static
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template-react:lint --skipRemoteCache --output-style=static
```

本轮结果：需求结构门禁通过，需求夹具 56/56，布局回归 10/10；产品治理脚本和 React 工程 lint 均零警告。依赖图保持无环，209 已依赖最终候选故事 211；故事状态与三个历史 JSON 均与评审基线核对一致。

| 浏览器冒烟                | 当前 product 布局                                | 旧基线 legacy 布局                              |
| ------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| seed                      | 生成 1,000 条日志夹具                            | 独立生成 1,000 条日志夹具                       |
| logic · React/Angular/Vue | 每端返回 5 行，五个活动均通过原始归一化校验      | 每端返回 1,000 行，五个活动均通过原始归一化校验 |
| ui · React 开发宿主       | 恢复、显示五项活动、语言菜单响应、刷新一致性通过 | 相同流程通过                                    |

旧端在独立 `b52320402` 工作树执行；两端使用相同 Node 26.12.0、测量脚本和布局模块，文件 SHA-256 分别为 `9cd231ba056692e542d2da9ef828e25e108c69722e341600d2c65095cfd70a3f`、`4d2591be91dbfafe18f92fba777197041b0c4491b2cd1fac7e6ff5819bb5961f`。已逐端比较 logic 的活动 ID、事务数量和 fingerprint，以及 UI 的文本和时间，前后一致。1000→5 的返回行数用于确认两端实际执行了各自实现，不作为新的生产性能预算。

本轮只启动开发宿主做工具冒烟。首次 seed 被 Vite 初次依赖预构建触发的导航中断，服务稳定后重新运行，两种布局均通过；未添加自动重试或修改测量数据。开发宿主跳过完整依赖构建时出现的 encrypted 适配器扫描告警已核对为已有 workspace 声明和链接下缺少构建产物，未改依赖声明；完整复验仍按性能记录先构建。旧检出初次安装使用了 shell 默认 Node 22，被仓库版本门禁拒绝；切换到与当前检出相同的 Node 26 后安装通过。

临时日志为 `/tmp/admin-refinement-validation.log`、`/tmp/admin-profile-{product,baseline}-{seed,logic,ui}.log` 和 `/tmp/admin-profile-comparison.log`，测量输出为对应 `.json`；长期复验以入库脚本和 [两种布局操作步骤](dashboard-performance-verification.md) 为准。临时服务和基线工作树在收尾时清理。结构与工具验证不能证明待实现的 Supabase 身份隔离、并发事务或三端协作行为。

## 证据边界

22 条故事的状态保持 2 Done、3 In Review、17 Backlog；201～216 仍全为 Backlog。协作规则必须在后续实现中由同层服务端集成与三端浏览器用例证明。此次未重新测量 1k/10k/100k 全套生产性能、构建体积或三端完整 E2E，原历史测量不变；脚本布局验证不能被当作新的性能预算结论。
