# 2026-11-14 验收收尾评审

本记录不改变AC、不豁免默认质量门禁，也不把评审请求记作批准。状态仍由故事YAML派生。原始输出见[证据索引](../evidence/2026-11-14/README.md)，当前结论见[验收台账](../verification-report.md)。

## 历史基线例外请求（待决定）

[US-008 #10](../stories/platform/ADESK-US-008-smoke-suite.md)与[US-206 #7](../stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md)需要实现前的基线记录。本轮只能从固定的实现前提交重建产物，在2026-11-14回溯测量；无法补造当时已经记录的历史。

| 项目         | 原始对照                                                                  | 当前结果                                                         | 需要决定的事项                                                     |
| ------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| 冒烟拆分     | 单体85b86fb3与首次拆分53a30d96；逐字节相同web/Orbit；交替各3轮            | 首次拆分1.10543倍，超过1.1倍，失败保留                           | 不接受首次拆分结果作为通过                                         |
| 后续独占调度 | 同一单体与6859fe56原七组；相同产物、检查键集合与方法                      | 中位数116.024s / 89.344s，0.77004倍，数值通过                    | 是否接受该固定历史实现的回溯对照，作为本次“实现前未记录”的一次例外 |
| initial体积  | 阶段A之前90d14a18与当前正式构建；入口静态依赖闭包与CSS，逐文件gzip level9 | 原始1,756,532→1,204,287字节；gzip525,471→384,380字节，预算已收紧 | 是否接受从实现前提交重建的体积对照，作为同一次历史流程例外         |

建议只对这两个明确条款记录一次例外：保留数值要求、失败样本和测量口径；不改全局CONVENTIONS，不声称测量发生在实现之前。未收到决定前，两条AC保持⚠️，US-008、US-206及依赖链不置Done。

## 生产发布（待执行）

当前本地产物的最终聚合门禁已通过（56任务、退出码0），最终发布演练也通过（没有上传）。既有域名与同站项目/登录已验证，发布命令会同时核对本次唯一部署地址、pages.dev生产入口和已绑定自定义域名。候选产物的来源与原始输出见[本轮聚合日志](../evidence/2026-11-14/verify-browser-support-3.txt)和[本轮发布演练](../evidence/2026-11-14/deploy-dry-run-browser-support.txt)；待执行命令为 `pnpm nx run aiao-desktop:deploy`。

候选入口文件SHA256为 `2f142ced7f1617a3463d1c008c5e0f8b5836934b8d4bf16b5df2248fa6ec873c`。当前版本写入schema 2026111301。降级保护第一次引入于6859fe56（B0）；真实旧生产部署d650c06f（Cloudflare Source bcfaa45）没有保护。库升级后不能回滚到B0之前的产物；故障处理应使用兼容版本或前向修复，不将命令打印的旧部署自动当成可用数据回滚点。

双域名用户文件隔离已用真实终端复制创建用户文件、读回正文并切换Origin，9项通过；旧生产覆盖种子文件及终端写入产生的Storage file meta not found失败仍保留。真实旧生产升级也已补上用户文件正文逐字比较，5项通过。发布后须重跑双域名隔离及真实Aiao Code检查，不能据本地和旧部署验收提前填写本次发布通过。

## 本机输入与读屏（待执行）

[US-107 #8](../stories/desktop/ADESK-US-107-shell-interaction-coverage.md)需要操作者实际按物理键盘。脚本负责建立本机Chrome普通标签页、记录到达页面的组合与对应行为，浏览器/系统截获的组合仍要列出和提供替代入口：

```bash
pnpm nx run aiao-desktop-e2e:verify-keyboard --args='--out=/Users/jimmy/Documents/GitHub/rxdb-012-web-desktop-product/aiao-desktop/requirements/evidence/2026-11-14/keyboard-physical.json'
```

[US-108 #6](../stories/desktop/ADESK-US-108-accessibility.md)按[VoiceOver清单](../../apps/e2e/VOICEOVER.md)记录V01～V14实际播报。2026-11-14检查时VoiceOver未运行；自动化AX树不能替代真实读屏输出。临时开启系统VoiceOver并恢复原状态是后续具体操作，尚未执行。

## 跨浏览器证据（真机 Safari 待补齐）

[US-005](../stories/platform/ADESK-US-005-cross-browser-smoke.md)的Firefox四项旧限制已撤除，同站不同源HTTPS组合使用原生Frame。新产物两轮均为479/479、passed=true、clean=true。WebKit已在入口禁用经Orbit的MessagePort读取并持续说明原因，握手公告与实际授权共用有效能力；两轮均478/479、passed=true、clean=false，原成功读取检查继续为false，没有用宿主直接读取替代。四轮无缺项、无清单外失败或页面错误，见[完整复验](../evidence/2026-11-14/browser-support.md#新产物跨浏览器连续复验)。#1及按#1支持分档执行的#5据此关闭，本次两轮未出现flake；不能推广为不存在时序缺陷。

#4真机Safari产品验收仍待完成。原生Safari已补入口说明、真实Aiao Code加载、文本编辑保存和刷新恢复；[后续验收](../evidence/2026-11-14/safari-product-followup.json)确认终端提示符、文件读写及刷新恢复，游戏已有真实3D画面与暂停/继续观察。指针锁定、完整游戏输入和全流程错误采集仍待补齐；鼠标捕获提示不直接归因为Safari能力缺失。用户改变Safari窗口后停止了GUI操作，本次静态服务已停止。Playwright WebKit有限支持不能直接改写成Safari已支持。故事仍In Review，历史基线例外、本机物理键盘与VoiceOver、正式发布也各自保留。

[再次原生游戏检查](../evidence/2026-11-14/safari-game-probe.json)仍未补齐#4：内嵌及独立 bench 页面均观察到“准备就绪”遮罩，未取得只读状态或性能返回值，根因未建立。不同 UUID 的起始页出现后停止 GUI，本轮服务已停止。既有成功观察与本轮异常同时保留，不将未确认的能力填写为已通过。
