---
id: US-405
title: 编辑器源码格式化
status: In Review
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-11-03
updated: 2026-11-03
tags: [code-editor, prettier, format, keyboard, aiao-vscode]
---

# 用户故事：编辑器源码格式化

## 作为/我想要/以便

**作为** 在 aiao-vscode 工作台里编辑前端代码的开发者
**我想要** 对当前文件执行格式化（快捷键与命令面板均可）
**以便** 不依赖本地工具链就能把源码整理成与仓库一致的风格，格式化结果可以撤销且不打断编辑

具体症状：工作台已有编辑、保存、预览与 Git 能力，但源码只能手写缩进；
VS Code 的 Shift+Alt+F /「格式化文档」是高频编辑动作，缺了它每段粘贴的代码都要手工对齐。

## 范围边界

### In Scope

- 「文件: 格式化代码」命令，快捷键 ⇧ / Shift + ⌥ / Alt + F，命令面板可执行；作用于当前焦点编辑器，无焦点时作用于活动文件。
- 浏览器内惰性加载 Prettier standalone 与 babel / estree / typescript / postcss / html / markdown / yaml 插件，不进初始包预算。
- 支持 ts / tsx / js / jsx / mjs / cjs / json / css / html / vue / md / yaml / yml；没有可用格式化器的文件给出明确输出提示，不做降级。
- 格式化以可撤销事务写入编辑缓冲：标记未保存、不自动保存，Ctrl / ⌘ + Z 一步还原。
- 内容已符合格式或为空时不产生写入；语法错误在问题面板报告。
- 格式选项与仓库 `.prettierrc` 基线一致（printWidth 120、单引号、分号、无尾逗号、arrowParens avoid、experimentalTernaries；tsx 的 jsxSingleQuote、vue 的 singleAttributePerLine、yaml 的 bracketSpacing false、html 的 whitespaceSensitivity ignore）。

### Out of Scope

- 仓库私有 Prettier 插件（sort-json / tailwindcss / organize-attributes / organize-imports）不在浏览器端运行。
- 保存时自动格式化、按语言选择格式化器、任意第三方格式化器与配置面板。
- XML / SVG / 纯文本格式化；二进制文件拒绝并提示。
- 格式化整个项目或多文件批量格式化。

## 验收标准

1. 对 ts / tsx / js / jsx / json / css / html / vue / md / yaml / yml 任一打开文件按 Shift+Alt+F，编辑缓冲更新为 Prettier 输出，状态栏保持「未保存」，Ctrl / ⌘ + Z 恢复格式化前内容。
2. 命令面板搜索「format」出现「文件: 格式化代码」且执行同一动作；对 svg / txt 或无扩展名文件执行只输出「没有可用格式化器」提示，不修改缓冲；二进制文件提示拒绝。
3. 对已符合格式或为空的文件执行不产生任何写入与日志噪音。
4. 含语法错误的文件执行后问题面板出现解析错误，缓冲保持原样。
5. 生产构建的初始包不包含 Prettier；Prettier 与插件以惰性 chunk 在首次格式化时加载，离线重开（Service Worker 预热后）仍可格式化。
6. 格式化结果与仓库 `.prettierrc` 基线一致（AC 例：`const  x={a:1,}` → `const x = { a: 1 };`）。
7. 键盘验收与单测证据可复跑：`pnpm nx test aiao-vscode`（formatter / mount / commands 用例）、`pnpm nx run aiao-vscode:verify-commands`。
