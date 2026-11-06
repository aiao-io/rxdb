---
id: US-408
title: 浏览器 Node 交互终端与项目运行信息
status: In Review
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-11-06
updated: 2026-11-06
tags: [aiao-vscode, terminal, webcontainer, node]
---

# 浏览器 Node 交互终端

作为开发者，我要在 aiao-vscode 里输入 Node.js、npm、pnpm 命令，看到项目启动输出、报错和服务预览。
用户在本次会话明确选择 WebContainer 浏览器运行环境。本故事承接 US-404 原范围之外的交互终端。

## 范围

- xterm.js 底部终端，支持 ANSI、输入、尺寸调整、Ctrl+C、清空显示、停止与重新启动。
- 惰性启动 WebContainer，只挂载当前项目已保存源码，不注入宿主 Git 元数据或 GitHub 凭据。
- 顶部「运行」保存全部文件，自动展开底部项目终端，先安装依赖，成功后再执行启动脚本；安装、编译、启动和运行报错实时可见。
- 项目终端是带状态标记的 jsh（`jsh --osc`）：「运行」像手动输入一样把安装命令与启动脚本输入 Shell，提示符、命令回显与耗时与普通终端一致；按 OSC 654 标记判断安装中、运行中、已停止与终端退出。
- 启动脚本是 vite 且未配置清屏时，「运行」补 `--clearScreen false`（npm 经 `--` 透传），导入项目同样适用；项目终端设置 `NODE_OPTIONS=--disable-warning=ExperimentalWarning`，只屏蔽实验特性警告。用户 2026-11-07 决定。
- 项目终端设置 `NG_HMR_TEMPLATES=0`：Angular 的组件模板热更新（`Component update sent`）在 WebContainer 预览页里被静默丢弃，关闭后模板改动改走整页刷新，保存后约 2 秒服务页更新。用户 2026-11-07 决定。
- 包管理器优先读取根 `package.json` 的 `packageManager`（仅支持 `npm@版本`、`pnpm@版本`）；未声明时根 `pnpm-lock.yaml` 优先，否则使用 npm。脚本优先非空 `scripts.dev`，其次非空 `scripts.start`，无有效脚本或清单配置错误时明确失败。
- 项目运行与手动输入命令使用独立会话，共用当前项目源码。Ctrl+C 可中断安装或服务，回到提示符后可继续输入命令；重复点击「运行」聚焦既有进程，退出后允许再次启动；项目终端正在执行手动命令时「运行」明确拒绝，不往命令中插入输入。
- 编辑器保存后增量同步；终端源码变化通过带 revision 的原子写入与删除回执保存，保留未保存缓冲。
- 排除依赖、构建产物和缓存，不跟随符号链接，沿用项目文件数与容量限制。
- 开发服务就绪时显示端口，在独立来源 iframe 预览；停止或切项目时保存变化并释放进程、监听器和服务面板。
- 预览栏刷新按钮保留独立的受控编译预览。终端不承诺原生 Node 扩展、任意 Nx 仓库兼容或离线冷启动。

## 验收

| 行为                                                                                          | 证据                                                                                                 | 状态 |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---- |
| 从已保存清单选择 npm / pnpm、dev / start，拒绝无效清单配置                                    | `project-command.spec.ts`                                                                            | ✅   |
| 顶部运行保存文件、展开项目终端，重复运行聚焦现有进程                                          | `mount.spec.ts`、`workbench-terminal.spec.ts`                                                        | ✅   |
| 独立 Shell 与项目会话、安装失败阻止启动、Ctrl+C 停止安装或服务                                | `webcontainer-runtime.spec.ts`、真实 Chromium 终端验证                                               | ✅   |
| 项目终端为 jsh：提示符、命令回显与耗时，Ctrl+C 后可继续输入，忙时拒绝运行，终端退出后重新启动 | `webcontainer-runtime.spec.ts`、`workbench-terminal.spec.ts`、真实 Chromium 终端验证                 | ✅   |
| vite 启动脚本补 `--clearScreen false`、项目终端屏蔽实验特性警告，老项目也保留安装过程         | `project-command.spec.ts`、`webcontainer-runtime.spec.ts`、真实 Chromium 终端验证                    | ✅   |
| Shell 输入输出、ANSI、尺寸调整与资源释放                                                      | `terminal-view.spec.ts`、`webcontainer-runtime.spec.ts`                                              | ✅   |
| 启动失败重试、旧项目迟到回调与退出保存                                                        | `workbench-terminal.spec.ts`                                                                         | ✅   |
| 双向文件变化、二进制、原子删除、dirty 缓冲与 revision 冲突                                    | `session.spec.ts`、Git backend/runtime/worker 测试                                                   | ✅   |
| 面板停靠保活、终端快捷键不被工作台拦截                                                        | `workbench-dockview.spec.ts`、`workbench-commands.spec.ts`                                           | ✅   |
| 真实 Chromium 运行 Node、文件双向同步、npm / pnpm 实际安装、服务预览、Ctrl+C、切项目和停止    | `pnpm nx run aiao-vscode:verify-terminal --production`；`benchmarks/browser-workbench-terminal.json` | ✅   |

上次交互终端基线校验：全套 776 项单测通过，随后补充的会话结构冲突测试也已通过；语句覆盖率 91.59%、
分支覆盖率 82.66%、行覆盖率 94.78%；ESLint 零警告、类型检查、生产构建通过。
该基线及表中原有验收证据不代表本轮顶部项目启动链路已经验证；本轮新增行为单独验收。

项目终端改为 jsh 后的校验（2026-11-07）：全套 895 项单测通过，ESLint 零警告、类型检查、生产构建通过；
生产构建上 `verify-terminal` 11 项检查全部通过，页面与控制台错误均为空（本机缺 Playwright 自带的
headless shell，改用系统 Chrome 运行）。停止读取 WebContainer 输出时只断开、不取消源流，
消除了此前报告里的 `Cannot close an errored readable stream` 页面错误。

首次启动与包安装依赖 WebContainer 服务和网络；商用 API key 由宿主选项传入。
官方接口依据：[WebContainer API](https://webcontainers.io/api)、[xterm.js](https://xtermjs.org/docs/)。
