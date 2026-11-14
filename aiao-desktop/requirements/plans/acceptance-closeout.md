# 2026-11-14 验收收尾评审

本记录保留AC数值要求与默认质量门禁；两项历史流程例外及正式发布已按[D-20](../decisions.md#d-20接受两项回溯基线例外并批准本次正式发布)接受。状态仍由故事YAML派生。原始输出见[证据索引](../evidence/2026-11-14/README.md)，当前结论见[验收台账](../verification-report.md)。

## 历史基线例外（已接受）

[US-008 #10](../stories/platform/ADESK-US-008-smoke-suite.md)与[US-206 #7](../stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md)需要实现前的基线记录。本轮只能从固定的实现前提交重建产物，在2026-11-14回溯测量；无法补造当时已经记录的历史。

| 项目         | 原始对照                                                                  | 当前结果                                                         | 需要决定的事项                                                     |
| ------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| 冒烟拆分     | 单体85b86fb3与首次拆分53a30d96；逐字节相同web/Orbit；交替各3轮            | 首次拆分1.10543倍，超过1.1倍，失败保留                           | 不接受首次拆分结果作为通过                                         |
| 后续独占调度 | 同一单体与6859fe56原七组；相同产物、检查键集合与方法                      | 中位数116.024s / 89.344s，0.77004倍，数值通过                    | 是否接受该固定历史实现的回溯对照，作为本次“实现前未记录”的一次例外 |
| initial体积  | 阶段A之前90d14a18与当前正式构建；入口静态依赖闭包与CSS，逐文件gzip level9 | 原始1,756,532→1,204,287字节；gzip525,471→384,380字节，预算已收紧 | 是否接受从实现前提交重建的体积对照，作为同一次历史流程例外         |

用户在明确询问两项例外与正式发布并说明升级风险后回复“继续”，已按D-20接受上述两条流程例外。数值要求、失败样本和测量口径保留；不改全局CONVENTIONS，不声称测量发生在实现之前。两条AC据此可关闭，相关故事仍须满足硬依赖。

## 生产发布（已上传并完成复验）

当前本地产物的最终聚合门禁已通过（56任务、退出码0），最终发布演练也通过（没有上传）。既有域名与同站项目/登录已验证，发布命令会同时核对本次唯一部署地址、pages.dev生产入口和已绑定自定义域名。候选产物的来源与原始输出见[本轮聚合日志](../evidence/2026-11-14/verify-browser-support-3.txt)和[本轮发布演练](../evidence/2026-11-14/deploy-dry-run-browser-support.txt)；已执行命令为 `pnpm nx run aiao-desktop:deploy`。

候选入口文件SHA256为 `2f142ced7f1617a3463d1c008c5e0f8b5836934b8d4bf16b5df2248fa6ec873c`。当前版本写入schema 2026111301。降级保护第一次引入于6859fe56（B0）；真实旧生产部署d650c06f（Cloudflare Source bcfaa45）没有保护。库升级后不能回滚到B0之前的产物；故障处理应使用兼容版本或前向修复，不将命令打印的旧部署自动当成可用数据回滚点。

双域名用户文件隔离已用真实终端复制创建用户文件、读回正文并切换Origin，9项通过；旧生产覆盖种子文件及终端写入产生的Storage file meta not found失败仍保留。真实旧生产升级也已补上用户文件正文逐字比较，5项通过。发布后已重跑[双域名隔离](../evidence/2026-11-14/release-domain-storage.json)与[真实Aiao Code](../evidence/2026-11-14/release-aiao-code.json)，各9项通过。原[发布命令](../evidence/2026-11-14/release-production.txt)上传成功、两个入口核对通过，但5个文件下载超时而退出1；随后对同一部署[只读复验95个公开文件](../evidence/2026-11-14/release-curl-reconciliation.json)全部通过，原失败保留，没有再次上传。US-004已据本次线上结果关闭。

## 本机输入与读屏（键盘已记录，读屏已延期）

[US-107 #8](../stories/desktop/ADESK-US-107-shell-interaction-coverage.md) 已于 2026-11-14～2026-11-15 由用户实际按下九组组合，并逐项保留网页行为、系统或浏览器响应、目标事件未送达情况与可用界面入口。结果见[人工验收记录](../evidence/2026-11-14/manual-chrome-acceptance.md)和[原始按键事件](../evidence/2026-11-14/manual-keyboard-probe-events.json)，能力矩阵同步实际边界。探针没有代按；无关组合、准备操作或超时均不作为目标组合通过的证据。

[US-108 #6](../stories/desktop/ADESK-US-108-accessibility.md) 仍按[VoiceOver 清单](../../apps/e2e/VOICEOVER.md)记录 V01～V14 实际播报。2026-11-14 的旧检查没有读屏结果；用户于 2026-11-15 明确要求「VoiceOver 跳过 未来再说」，本轮不再执行读屏验收，AC#6 保留未验收，详见[延期记录](../evidence/2026-11-15/voiceover-deferral.json)。后续恢复验收时先重新记录环境、初始开关与导航设置，再逐项听取实际播报并恢复设置。自动化 AX 树不能替代真实读屏输出。

## Chrome 范围（已按用户要求收敛）

用户明确要求“只验收 chrome 就够了”，已按[D-19](../decisions.md#d-19只验收桌面-chrome)同步[US-005](../stories/platform/ADESK-US-005-cross-browser-smoke.md)、能力矩阵、README和台账。当前正式产物的Chromium两轮均为24组479项全部通过，窄屏与触屏仿真通过；真实Chrome的GPU与游戏记录单独归档。US-005当前AC与全部硬依赖已关闭。

Safari、Firefox、WebKit均不在本轮必验或支持承诺内。[历史跨浏览器记录](../evidence/2026-11-14/browser-support.md)、[Safari后续验收](../evidence/2026-11-14/safari-product-followup.json)和[再次游戏检查](../evidence/2026-11-14/safari-game-probe.json)完整保留；未完成的Safari观察没有改写成通过。

Chrome范围调整时曾有5项AC待关闭，见[历史范围调整记录](../evidence/2026-11-14/chrome-only-scope.json)。D-20已接受两项历史流程例外，本次正式发布与线上复验已完成；2026-11-15 已关闭 US-107 #8，当前仅剩 US-108 #6 VoiceOver，见[需求汇总](../evidence/2026-11-14/closeout-summary.json)。
