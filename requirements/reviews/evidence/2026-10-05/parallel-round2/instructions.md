# 有界包级收尾任务（第二轮10任务）

用户明确要求再开10个子任务，今天2026-10-05收尾。每代理只负责scope.json指定的一个约10–21文件小包，不扩业务实现。工作区 /Users/jimmy/Documents/aiao/rxdb。先读AGENTS.md、nx-workspace技能、自己scope和现有独立计划/执行记录。

## 目标与证据

1. 阅读自己全部受控源码、tests、配置、文档、构建/consumer。生成文件核其来源与对应生成结果；sha清单不是已读。file-inspection.json如实记录文件/区间/关注点。
2. 按原C及原完成条件逐项给明确结论/生产锚点/足够证据，补最小必要探针，不再无限发现新bug。目标是完整闭环小包。有缺陷已分流不等于评审不能完成，但缺必要验证不能假绿；未验证要明确动作/测量面。
3. 第一轮已有有效证据：parallel/validation/framework-editor-coverage/<对象>/coverage-summary.json、JUnit；coverage-gate.json四指标；72实际对象lint/typecheck分批通过但不是一份稳定HEAD；packed-consumer-entry-check.json实际tar包与独立root ESM解析，不含typed/runtime consumer。Angular发布根是resolved release的dist/packages/...，不能误报源根没exports。
4. 主控补独立consumer/动态验证。尽早写自己证据目录validation-requests.json，每项project、target、args、reason、criticalForC。不要自己跑build/test/coverage/e2e/server/容器，不等全部无关后端；主控日志放parallel-round2/validation/。
5. 原C最低场景全部有证据才是完整C；局部子面单独标部分执行。全对象完成需原完成条件逐条证据，评审完成与发布就绪分开；不能删要求或为赶数字将未测设备/浏览器说成不适用。每项确有理由的未验证分流由主控最终裁定。

## 唯一写范围

scope指定 requirements/reviews/packages/<对象>.md、requirements/reviews/results/packages/<对象>.md、parallel-round2/<对象>/。必要只新增自己packages/<对象>/src/**/review-round2-*.spec.ts，不改原tests、实现、依赖。可以读同族其他框架/core接口，但不写它们。禁止README/总计划/台账/旧RV改动，禁止git add/commit/reset/stash/unstage、嵌套agent、GUI操作和发布。

Angular先list_projects/get_best_practices；Nx对象不在examples CLI workspace，工具失败记录不阻断只读。三端对照读tri-framework-check。当前用户/外部持续改实现，历史测量不冒充新HEAD；第一轮RV066/067/068已复验通过并清理，其他已登记问题参看parallel/findings-registry.json，不重复登记。

## 必须交付

源码阅读与原C证据映射、对象级计划/结果直接落盘；closure.json记录完整C、局部子面、完整对象候选和剩余动作。新问题先findings.pending.md，主控复验去重编号。不要只交发现不写文档，不无限跨对象扩读。最后中文报告完成度、验证请求、必要未验和全部改动绝对路径。
