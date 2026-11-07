# Markdown Preview Enhanced 兼容性尝试

> 验证日期：2026-11-07。
> 目标：在 aiao-vscode 的 Monaco 编辑器中运行 `shd101wyy.markdown-preview-enhanced`。
> 记录性质：**接入宿主之前的早期失败探针**。下列原始结果保留，不作为当前实现结论。后续真实扩展宿主与功能验收见 [Markdown 扩展加载与使用](markdown-extension-implementation.md)。

## 结论

执行此早期探针时，aiao-vscode 已支持 Monaco 编辑 Markdown，但尚未实现 VSIX 安装器、扩展宿主、`vscode` API 与插件 Webview 服务。
因此，本次没有完成插件安装、激活和预览功能验证，不能判断为“插件已兼容”。

发布包提供浏览器入口，适合作为后续 Web Extension Host 的首个候选验收插件。
本次失败说明当前宿主能力缺失，不代表该插件无法在浏览器版 VS Code 中运行。

## 发布包核验

本次下载 GitHub Releases 的正式 VSIX，读取包内 `extension/package.json` 与实际浏览器入口。

| 项目         | 核验值                                                             |
| ------------ | ------------------------------------------------------------------ |
| 插件 ID      | `shd101wyy.markdown-preview-enhanced`                              |
| 版本         | `0.8.40`                                                           |
| 发布时间     | `2026-10-09T01:24:31Z`                                             |
| VS Code 要求 | `^1.82.0`                                                          |
| 桌面入口     | `./out/native/extension.js`                                        |
| 浏览器入口   | `./out/web/extension.js`                                           |
| 相关激活事件 | `onStartupFinished`、`onLanguage:markdown`                         |
| VSIX 长度    | `23,619,315` 字节                                                  |
| SHA-256      | `1d7973cd154b9b90b5361f7e2d611ad9c7da931756b5301188ca084050f43409` |

包内浏览器入口使用 CommonJS 的 `module.exports` 和外部 `require("vscode")`。
上游构建配置同样将浏览器输出设为 `format: 'cjs'`，并把 `vscode` 保留为宿主提供的外部模块。
因此，单独加载 Monaco 或给页面增加一个脚本标签，无法替代正式扩展运行环境。

## 实际浏览器观察

复用本工作区的开发服务器，在独立浏览器上下文中新建临时项目，选择 Monaco 并打开 `README.md`。
浏览器为 Chrome `156.0.8078.81`。原始结果保存在[验证记录 JSON](artifacts/markdown-preview-enhanced-0.8.40-probe.json)。

| 检查                                                          | 观察结果                                                                     | 判定               |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------ |
| Monaco 打开 Markdown 源码                                     | `README.md` 的 Monaco 实例可见                                               | 通过               |
| 原始浏览器入口裸 Worker 加载                                  | 资源返回 HTTP 200，随后抛出 `Uncaught ReferenceError: module is not defined` | 缺少扩展模块运行时 |
| 命令面板查找 `markdown-preview-enhanced.openPreviewToTheSide` | 0 个匹配，显示“没有匹配的命令”                                               | 插件命令未注册     |
| 正式扩展宿主调用 `activate(context)`                          | 当前无扩展宿主                                                               | 阻塞，未执行       |
| 侧边 Markdown 预览与实时更新                                  | 当前无插件预览面板                                                           | 未执行             |
| Mermaid、公式、图片、滚动同步及导出                           | 尚未到达对应功能                                                             | 未执行             |

裸 Worker 探针没有模拟 `vscode` API，也没有创建假的成功激活结果。
该探针只说明原始发布包需要模块加载器和扩展宿主；它不等价于 VS Code 的 Web Extension Host，更不能据此判定插件自身有缺陷。
插件命令没有出现在当前工作台，也只代表当前未加载，不能推导所有宿主接入后的功能均不可用。

## 预览链路需要补齐的宿主能力

根据浏览器入口、共享激活代码和预览实现，首个侧边预览至少涉及以下能力。
这些是已确认的接入点，不是完整 API 清单。

| 能力               | 插件使用位置 / API                                                                        | aiao-vscode 接入要求                                                           |
| ------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 扩展注册与激活     | 浏览器入口、`ExtensionContext`、`context.subscriptions`                                   | 加载 VSIX 贡献点与资源，为扩展提供真实运行时并执行激活 / 释放                  |
| 命令               | `commands.registerCommand`、`markdown-preview-enhanced.openPreviewToTheSide`              | 将插件命令接入工作台命令面板与执行路径                                         |
| 活动文档与编辑事件 | `window.activeTextEditor`、`workspace.onDidChangeTextDocument`、保存及选区事件            | 与现有未保存编辑缓冲、URI、语言标识和文档版本保持一致                          |
| 文件系统与配置     | `workspace.fs`、`workspace.getConfiguration`、工作区和扩展资源                            | 映射现有 OPFS 项目，支持图片、相对路径和插件配置，不只传入一段 Markdown 字符串 |
| Webview            | `window.createWebviewPanel`、`webview.asWebviewUri`、`onDidReceiveMessage`、`postMessage` | 实现插件独立预览、资源映射、CSP、消息通信和销毁流程                            |
| 自定义编辑器       | `window.registerCustomEditorProvider`                                                     | 根据实际激活路径实现注册；不能用空函数掩盖不支持的调用                         |

当前受控编译预览 iframe 没有实现 VS Code Webview 契约，不能直接作为该插件的预览宿主。
已有 WebContainer 终端也不会自动提供 `vscode` API、扩展注册和 Webview 服务。

## 下一阶段最小验收

接入真实 Web Extension Host 后，再使用此正式 VSIX 逐项验证：

1. 加载浏览器入口并激活，命令面板出现插件预览命令，失败可定位。
2. 打开 Markdown，执行侧边预览，标题、列表与代码块正确渲染。
3. 修改未保存文本，预览及时更新；保存及刷新恢复沿用工作台现有语义。
4. 验证相对图片、Mermaid、公式与滚动同步，分别记录通过或失败。
5. 关闭预览、切换项目和卸载扩展后，文档订阅、面板与运行时资源正确释放。

本机程序、命令执行或其他宿主能力相关功能需要单独验证，不能用基本预览通过替代完整功能验收。
CodeMirror 的插件文档桥接需要另行实现和验证；本次浏览器观察使用 Monaco。

## 一手资料

- [0.8.40 正式发布与 VSIX](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/releases/tag/0.8.40)
- [插件清单](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/blob/0.8.40/package.json)
- [构建配置](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/blob/0.8.40/build.js)
- [浏览器激活入口](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/blob/0.8.40/src/extension-web.ts)
- [共享激活与命令注册](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/blob/0.8.40/src/extension-common.ts)
- [Webview 预览实现](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/blob/0.8.40/src/preview-provider.ts)
- [VS Code Web Extensions](https://code.visualstudio.com/api/extension-guides/web-extensions)
