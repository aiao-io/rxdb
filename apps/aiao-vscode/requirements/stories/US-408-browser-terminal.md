---
id: US-408
title: 浏览器 Node 交互终端与项目运行信息
status: In Progress
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
- 编辑器保存后增量同步；终端源码变化通过带 revision 的原子写入与删除回执保存，保留未保存缓冲。
- 排除依赖、构建产物和缓存，不跟随符号链接，沿用项目文件数与容量限制。
- 开发服务就绪时显示端口，在独立来源 iframe 预览；停止或切项目时保存变化并释放进程、监听器和服务面板。
- 受控编译预览继续独立运行。终端不承诺原生 Node 扩展、任意 Nx 仓库兼容或离线冷启动。

## 验收

| 行为 | 证据 | 状态 |
| --- | --- | --- |
| Shell 输入输出、ANSI、尺寸调整与资源释放 | `terminal-view.spec.ts`、`webcontainer-runtime.spec.ts` | ✅ |
| 启动失败重试、旧项目迟到回调与退出保存 | `workbench-terminal.spec.ts` | ✅ |
| 双向文件变化、二进制、原子删除、dirty 缓冲与 revision 冲突 | `session.spec.ts`、Git backend/runtime/worker 测试 | ✅ |
| 面板停靠保活、终端快捷键不被工作台拦截 | `workbench-dockview.spec.ts`、`workbench-commands.spec.ts` | ✅ |
| 真实 Chromium 运行 Node、文件双向同步、服务预览、Ctrl+C 和停止 | `pnpm nx run aiao-vscode:verify-terminal`；`benchmarks/browser-workbench-terminal.json` | ⚠️ |

首次启动与包安装依赖 WebContainer 服务和网络；商用 API key 由宿主选项传入。
官方接口依据：[WebContainer API](https://webcontainers.io/api)、[xterm.js](https://xtermjs.org/docs/)。
