# 2026-11-14 验收收尾评审

本记录不改变AC、不豁免默认质量门禁，也不把评审请求记作批准。状态仍由故事YAML派生。原始输出见[证据索引](../evidence/2026-11-14/README.md)，当前结论见[验收台账](../verification-report.md)。

## 历史基线例外请求（待决定）

[US-008 #10](../stories/platform/ADESK-US-008-smoke-suite.md)与[US-206 #7](../stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md)需要实现前的基线记录。本轮只能从固定的实现前提交重建产物，在2026-11-14回溯测量；无法补造当时已经记录的历史。

| 项目 | 原始对照 | 当前结果 | 需要决定的事项 |
| --- | --- | --- | --- |
| 冒烟拆分 | 单体85b86fb3与首次拆分53a30d96；逐字节相同web/Orbit；交替各3轮 | 首次拆分1.10543倍，超过1.1倍，失败保留 | 不接受首次拆分结果作为通过 |
| 后续独占调度 | 同一单体与6859fe56原七组；相同产物、检查键集合与方法 | 中位数116.024s / 89.344s，0.77004倍，数值通过 | 是否接受该固定历史实现的回溯对照，作为本次“实现前未记录”的一次例外 |
| initial体积 | 阶段A之前90d14a18与当前正式构建；入口静态依赖闭包与CSS，逐文件gzip level9 | 原始1,756,532→1,204,286字节；gzip525,471→384,373字节，预算已收紧 | 是否接受从实现前提交重建的体积对照，作为同一次历史流程例外 |

建议只对这两个明确条款记录一次例外：保留数值要求、失败样本和测量口径；不改全局CONVENTIONS，不声称测量发生在实现之前。未收到决定前，两条AC保持⚠️，US-008、US-206及依赖链不置Done。

## 生产发布（待执行）

当前本地产物待本轮最终门禁通过后发布。既有域名与同站项目/登录已验证，发布命令会同时核对本次唯一部署地址、pages.dev生产入口和已绑定自定义域名。

当前版本写入schema 2026111301。降级保护第一次引入于6859fe56（B0）；真实旧生产部署d650c06f（Cloudflare Source bcfaa45）没有保护。库升级后不能回滚到B0之前的产物；故障处理应使用兼容版本或前向修复，不将命令打印的旧部署自动当成可用数据回滚点。

发布后必须重跑双域名用户文件隔离及真实Aiao Code检查。旧生产写文件后存在Storage file meta not found的失败，已保留；当前构建通过本地文件保存、跨页读回和升级检查，不能据此提前填写线上验收通过。

## 本机输入与读屏（待执行）

[US-107 #8](../stories/desktop/ADESK-US-107-shell-interaction-coverage.md)需要操作者实际按物理键盘。脚本负责建立本机Chrome普通标签页、记录到达页面的组合与对应行为，浏览器/系统截获的组合仍要列出和提供替代入口：

```bash
pnpm nx run aiao-desktop-e2e:verify-keyboard --args='--out=/Users/jimmy/Documents/GitHub/rxdb-012-web-desktop-product/aiao-desktop/requirements/evidence/2026-11-14/keyboard-physical.json'
```

[US-108 #6](../stories/desktop/ADESK-US-108-accessibility.md)按[VoiceOver清单](../../apps/e2e/VOICEOVER.md)记录V01～V14实际播报。2026-11-14检查时VoiceOver未运行；自动化AX树不能替代真实读屏输出。临时开启系统VoiceOver并恢复原状态是后续具体操作，尚未执行。

## 跨浏览器证据（待补齐）

[US-005](../stories/platform/ADESK-US-005-cross-browser-smoke.md)保留Firefox跨源替身iframe输入/焦点/刷新与WebKit剪贴板授权的自动化缺口。现有报告的passed只代表没有清单外失败，clean才代表全部检查通过；“有限支持”清单标签本身不能代替入口禁用与说明。真实浏览器补证或明确产品降级需实际完成后再关闭，不把自动化驱动缺口伪装成产品禁用。
