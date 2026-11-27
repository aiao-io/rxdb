# 跨浏览器后续复验（2026-11-14）

以下是产品能力限制改动之前的夹具与输入前置条件复验，正式产品产物不变。报告的source是完成报告时的工作区；本节的被测对象以固定产物摘要为准。以下完整轮均为24组、476个检查键，入口SHA256为 `74a43cbe80fc3498d5e58a7e33693ef9b4be6a73e17b22099cb23a5667b7a192`。不改原有断言，不以清单豁免宣称全过。所有脚本按键均为Playwright可信输入，不构成物理键盘验收。

## 完整轮结果

| 原始报告                                     | 判定                   | 通过检查键 | 缺失键 | 已知限制 | 页面错误 | 秒      |
| -------------------------------------------- | ---------------------- | ---------- | ------ | -------- | -------- | ------- |
| [firefox-final-1.json](firefox-final-1.json) | 失败，原样保留         | 474/476    | 0      | 0        | 0        | 422.169 |
| [firefox-final-2.json](firefox-final-2.json) | 全部通过               | 476/476    | 0      | 0        | 0        | 476.460 |
| [firefox-final-3.json](firefox-final-3.json) | 失败，原样保留         | 474/476    | 0      | 0        | 0        | 500.828 |
| [firefox-final-4.json](firefox-final-4.json) | 全部通过               | 476/476    | 0      | 0        | 0        | 431.200 |
| [firefox-final-5.json](firefox-final-5.json) | 失败，原样保留         | 411/476    | 64     | 0        | 0        | 642.769 |
| [webkit-final-1.json](webkit-final-1.json)   | 无清单外失败；仍有保留 | 475/476    | 0      | 1        | 0        | 366.860 |
| [webkit-final-2.json](webkit-final-2.json)   | 无清单外失败；仍有保留 | 475/476    | 0      | 1        | 0        | 386.893 |

Firefox最终抹盘完成前置条件的第四轮已全通过；第五轮的多标签页检查也通过，但出现窗口还原几何未命中，以及初次启动Finder等待超时、缺失64个无障碍检查键。两组均无页面错误，原失败保留，不能写成连续两轮通过，也不能未经复现就归咎于并发。WebKit两轮均为passed=true、clean=false：只有 `hostCapabilities.clipboardReadAfterGrant` 未通过。无清单外失败不等于全部通过，US-005的#1、#4、#5仍不关闭。

## Firefox来源模型与输入

[四种sandbox/allow对照](firefox-sandbox-probe.json)均能输入与刷新。[真实HTTP/HTTPS来源对照](firefox-site-probe.json)及[路由来源对照](firefox-routed-site-probe.json)进一步确认：驱动缺口发生在跨站隔离iframe，同站不同源的HTTPS iframe可由原生Frame操作。不能将所有跨源iframe都写成不可操作。

[artifact-origin.mjs](../../../apps/e2e/src/harness/artifact-origin.mjs)把浏览器看到的桌面请求转送到只读本地产物服务器，桌面地址为 `https://desktop-smoke-<端口>.vscode.aiao.io`，应用仍是 `https://vscode.aiao.io`，符合自定义域名桌面与Aiao Code的同站、不同源关系。正式JavaScript、清单应用地址、sandbox、COOP/COEP与外网拦截保持原样。没有关闭浏览器安全功能，亦不将任意跨站集成或pages.dev组合推广为已验证。

[修改前报告](firefox-site-origin-red.json)保留键盘失败。[来源修复后的定向报告](firefox-site-origin-checks.json)关闭了键盘、透明窗口、文件面板焦点缺口，也暴露出原整组豁免隐藏的窗口拖动与错误收集问题。[视口内拖动报告](firefox-viewport-reachable-checks.json)的51个窗口布局断言通过，但当时不同标签页仍把主动拦截外网的网络控制台消息当作页面错误；已统一使用会话的错误收集器，所有真正的pageerror仍判失败。

同站转送的回归放在现有夹具自检，普通Node单测不依赖Firefox安装。[Firefox夹具报告](firefox-artifact-fixtures.json)16项全部通过，其中新增8项证明跨源、隔离、Playwright可信键盘输入、独立存储、相对资源、查询参数、错误来源拒绝和刷新后数据保留。

## Firefox多标签页保存

[完整第一轮](firefox-final-1.json)与[单组复现](firefox-multi-tab-recheck.json)均未命中抹盘后的保存失败提示，连带的正文保留组合断言也为false。[现场日志](firefox-multi-tab-recheck.txt)显示正文仍为B-late-edit、标题仍有Edited；不能将这次失败描述为正文丢失。

明确切到B标签页并点击编辑区后，[定向结果](firefox-multi-tab-focus-checks.json)29项曾全部通过；但[后续完整轮](firefox-final-3.json)仍复现相同提示缺失，因此不能把焦点切换单独当作完整修复。

原脚本以固定2.5秒和种子图标出现推断抹盘已完成；[抹盘处理](../../../apps/web/src/app/apps/disk-utility/disk-panels.ts)实际上在文件复制之后还会等待目录对账，整个过程持磁盘锁，只有完成后才重启。最终前置条件改为等待A完成重启并登录，再切到B保存；不增加原有提示断言超时，也不改变产品行为、提示文字与正文断言。新的[定向报告](firefox-multi-tab-erase-complete.json)和完整轮保留实际结果，未命中时还记录键盘事件、锁状态和提示历史。

## WebKit剪贴板

原脚本同时申请clipboard-read与clipboard-write，但当前WebKit只接受前者。改为申请它支持的读取权限后，[直接读取与内容核对](webkit-clipboard-read-only-checks.json)已有两项转为通过；重新点击后[Orbit读取仍失败](webkit-clipboard-gesture-checks.json)。不把宿主直接读取替代应用经Orbit的读取。

[不改变API结果的产品追踪](webkit-product-clipboard-trace.json)记录到宿主有焦点、用户激活为true：直接读取成功，Orbit读取仍是NotAllowedError。[普通postMessage对照](webkit-clipboard-permission-scopes.json)可读，[先拒绝再授权对照](webkit-clipboard-after-denial-probe.json)也可读；[MessagePort对照](webkit-clipboard-message-port-probe.json)在父来源、双来源、上下文整体授权后都被拒绝，[可信按钮点击对照](webkit-clipboard-trusted-click-probe.json)同样被拒绝。所有实验只写固定验收文本，不覆盖浏览器权限校验，不用假剪贴板替代系统API。

当前[WebKit限制清单](../../../apps/e2e/src/baseline/limitations-webkit.json)仅保留Orbit读取这一项。原生Safari的最小跨源页面也复现MessagePort读取拒绝，见[原始记录](safari-native-clipboard.json)：固定文本写入与宿主直接读取成功，MessagePort读取得到NotAllowedError，且宿主有焦点、用户激活为true。该实验不等于完整Safari产品验收。这些旧产物轮次不含入口禁用；后续产品实现与新产物验收见[有限支持复验](browser-support.md)，US-005继续In Review；Firefox原四项限制已从[清单](../../../apps/e2e/src/baseline/limitations-firefox.json)撤除。
