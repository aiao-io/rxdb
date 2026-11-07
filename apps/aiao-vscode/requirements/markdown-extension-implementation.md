# Markdown 扩展加载与使用

目标：运行正式 `shd101wyy.markdown-preview-enhanced@0.8.40`，提供接近 VS Code 的 Markdown 插件使用流程。

## 验收范围

- 复用 VS Code 扩展 API、扩展生命周期、命令、文档、文件系统和 Webview 服务，加载正式发布包；不能用独立 Markdown 渲染器冒充插件。
- 插件预装，用户可查看状态、启用和禁用，启停偏好跨刷新保留；失败显示真实原因并可重试。
- Markdown 编辑器标题按钮、编辑区右键、命令面板和 `Ctrl/Cmd+Shift+V`、`Ctrl/Cmd+K V` 可启动预览。
- 打开侧边预览后，标题、列表、代码块和 HTML 正确渲染，未保存修改即时同步。
- Monaco 与 CodeMirror 共享同一项目文档桥接，切换引擎不丢草稿、不重复预览。
- 相对图片、Mermaid、公式和双向滚动分别实测；切换文件、切换项目、关闭预览、禁用扩展均不串文档并正确释放资源。
- 原项目运行预览、Git 暂存与保存语义保持不变；插件事件不能隐式保存编辑缓冲。
- 原生程序相关导出能力遵循浏览器宿主限制，明确给出错误，不伪造成功。

## 用户操作

1. 在左侧活动栏打开「扩展」，找到 `Markdown Preview Enhanced`。插件已预装，默认启用；显示「已禁用」时点击「启用」。
2. 打开 `.md` 文件。点击编辑器标签组右上角「打开 Markdown 侧边预览」，或在编辑区右键选择 `Markdown Preview Enhanced: 打开侧边预览`。
3. `Ctrl/Cmd+K` 后按 `V` 打开侧边预览；`Ctrl/Cmd+Shift+V` 打开当前组预览。命令面板可搜索完整命令 ID `markdown-preview-enhanced.openPreviewToTheSide`，激活后也显示插件自己的中文命令名。

工作台全局「打开预览」用于运行项目；Markdown 的入口在文档标签栏和扩展详情中。Markdown 预览打开后随草稿即时更新，无需保存。

可用以下内容确认内嵌 HTML 的渲染：

```markdown
# 预览测试

<div style="padding:12px;border:1px solid #888">这里是渲染后的 HTML 元素</div>

- 列表

公式 $x^2+y^2=z^2$
```

HTML 结构以浏览器 DOM 渲染；当前未额外提供 DOM 树检查器。

## 实现边界

独立页面内初始化 `@codingame/monaco-vscode-api`，隔离其 Monaco 服务与工作台已有 Monaco。
正式 VSIX 固定版本和 SHA-256，构建时校验并复制为同源静态资源。
插件在真实扩展宿主中激活；工作台通过带请求编号的 MessagePort 同步文档并调用命令。
宿主的真实 Webview 负责渲染，Dockview 负责预览的位置和面板生命周期。

## 验证记录

2026-11-07，Chrome 156 中使用正式发布包的浏览器入口完成实际应用验证。正式插件注册了 28 个命令。HTML、列表、代码块、相对路径 SVG、图片灯箱、KaTeX 和 Mermaid 均由插件本身渲染。

自动浏览器验收 **15 项全部通过**，插件宿主错误列表为空；原始结果见 [浏览器验收报告](../benchmarks/browser-workbench-markdown-extension.json)。验收覆盖：两种编辑器的实时更新和双向滚动、文件跟随与锁定、可撤销的插件编辑、原生关闭和重开、两组快捷键、右键菜单、禁用／刷新／启用、草稿恢复、显式保存及项目切换后创建全新宿主。TikZ 在线资源限制单独记录，不计为已支持能力。

CodeMirror 和 Monaco 共用草稿及磁盘快照，编辑器切换保留同一个扩展宿主。预览滚动仅调整编辑器视区，不移动选区；编辑区滚动使用真实可见行通知扩展。插件修改作为可撤销编辑进入草稿；插件写文件才显式保存指定文件。迟到编辑和保存请求校验草稿／磁盘基线，项目切换和禁用使旧回调失效。

重复验收入口：

```sh
pnpm nx run aiao-vscode:verify-markdown-extension
```

此命令连接已启动的 `http://localhost:4320/`，使用独立浏览器上下文生成临时项目；可传入 `--args='--url=http://localhost:端口/'`。报告保存在 `apps/aiao-vscode/benchmarks/browser-workbench-markdown-extension.json`，截图与报告同目录。它实际运行正式插件，不注入 Markdown 渲染器或伪造插件 API。

应用完整单测：60 个测试文件、1,058 条测试通过；行覆盖率 94.12%、语句 90.91%、分支 83.00%、函数 90.23%。独立宿主由单独的 TypeScript 配置检查，并由真实浏览器验收覆盖。

生产构建通过；仍有首包 1.90 MB 超过 1.50 MB 警告预算，以及 `packages/utils` 的 `ms` CommonJS 提示。ESLint 零警告，应用、测试与独立宿主的三份类型检查均通过。

## 已确认限制

- 当前预装并验证 `shd101wyy.markdown-preview-enhanced@0.8.40`，尚无通用 VSIX 安装或 Marketplace 管理器。
- 浏览器宿主不提供任意 Node 原生模块或本机命令。依赖 Pandoc、LaTeX、本机浏览器或桌面进程的导出功能不在此次验收范围内。
- 上游预览会加载 `tikzjax.com` 的在线 JS 和字体样式。该站资源未满足本应用的 COEP 跨源隔离要求，TikZ 在线渲染尚不可用；KaTeX、Mermaid 和同源相对图片不受此限制。
- Markdown 插件读取项目文件；全局配置文件写入和其他插件贡献点尚无完整的工作台界面。

## 正式发布包的浏览器适配

VSIX 原包保持固定 SHA-256。构建时对浏览器入口执行一个有数量断言的资源根修正：
将上游 `vscode.Uri.file(this.context.extensionPath)` 改为 `this.context.extensionUri`。
上游的原写法会把真实 `extension-file://...` 资源错误限制在 `file://...` 根下，导致图片灯箱资源返回 401。
修正只保留扩展 URI 的 scheme 和 authority，不扩大文件系统访问范围。
原始入口与适配入口的 SHA-256、修正原因记录在生成的 `extension-assets.json`，插件的渲染逻辑与命令实现不变。
