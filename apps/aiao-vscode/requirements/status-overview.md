# 状态概览

统计只包含 `stories/` 下带 story frontmatter 的文件，状态以 YAML `status` 为唯一真相源。

## 待评审（2 条）

| Story                                                                          | 剩余范围                                                                                                   |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| [US-404 浏览器本地开发工作台](stories/US-404-browser-development-workbench.md) | 内核与应用外壳已实现，四模板、Git、离线、隔离与仓外消费证据在 `benchmarks/`；affected 门禁与代码评审收尾。 |
| [US-405 编辑器源码格式化](stories/US-405-code-formatting.md)                   | 格式化命令、快捷键与惰性加载已实现，formatter / mount / commands 单测通过；浏览器键盘验收与代码评审收尾。  |

## 阶段与验收

US-404 的 A（运行与持久化探针）/ B（文件工作区与应用接入）/ C（可恢复与可退出）三阶段 AC 均已通过；
可重跑入口见故事正文「验收证据」表。合并前保持 In Review，不以分支验证代替合并。

US-405 的实现与单测已落地（`formatter` / `mount` / `workbench-commands`），键盘验收走
`aiao-vscode:verify-commands`；Prettier 以惰性 chunk 加载，不进初始包预算。
