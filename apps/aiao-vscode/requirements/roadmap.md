# 路线图

本页回答「接下来做什么、什么必须排在什么前面」。故事状态与关闭条件见[状态概览](status-overview.md)。

## 当前任务顺序

| 工作线                   | 下一步                                                                                                                                                     | 前置与边界                                                                                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-404 合入与评审        | aiao-vscode 应用（工作台内核 + Angular 外壳 + e2e）过 CI 与评审后合并                                                                                      | 故事保持 In Review；affected 门禁、三端对称为仓库级要求，本应用不再有三端绑定                                                                                                                                                         |
| US-405 格式化收尾        | 键盘验收复跑与代码评审，随应用一起合并                                                                                                                     | 先起 `pnpm nx serve aiao-vscode`（4320）；报告写入 `apps/aiao-vscode/benchmarks/`                                                                                                                                                     |
| 验收证据复跑             | `aiao-vscode:verify-export / verify-offline / verify-scm / verify-save-preview / verify-docking / verify-commands / verify-github-auth`                    | 先起 `pnpm nx serve aiao-vscode`（4320）或生产构建 + 静态服务；报告写入 `apps/aiao-vscode/benchmarks/`；verify-github-auth 需 `GITHUB_PAT` 环境变量                                                                                   |
| 真实部署与公开访问       | 为生产构建选托管（COOP / COEP 响应头 + Service Worker）并公开验收                                                                                          | 依赖仓库级发布治理；离线与隔离边界必须在真实 origin 复验，本地 localhost 不算                                                                                                                                                         |
| 应用产品化               | 模板扩充、项目模板市场、设置持久化、保存时自动格式化等按新故事立项                                                                                         | 交互终端由 US-408 单独承接，受控预览不扩展为完整 Node IDE                                                                                                                                                                             |
| US-406 GitHub 集成       | 阶段 A 代码面完成：认证、虚拟仓库后端、选择器、登录对话框、欢迎视图入口、Cloudflare Pages Functions 与验收脚本均已落地；剩余真实 PAT 验收与 OAuth App 注册 | 依赖 [vscode.dev GitHub 集成研究](../../../requirements/domain-research/vscode-dev-github-integration.md)；`/redirect` 与 token 交换 / 登出在 `deploy/` 的 Pages Functions 里，secret 经 wrangler secret；不阻塞 US-404 / US-405 收尾 |
| US-407 首次进入欢迎视图  | 空目录首启不初始化项目；资源管理器欢迎视图（打开文件夹 / 最近项目 / 初始化 Demo）红测与实现已完成，全量单测通过；待浏览器手动验收与评审                    | 依赖 US-404 内核；与 US-406 并行不冲突；打开文件夹走 File System Access API 单向导入，模板与入口推断见故事技术笔记                                                                                                                    |
| US-409 运行时对比        | 阶段 D：almostnode、burrow 最薄适配，按各自声称的能力跑冒烟，失败记入兼容性矩阵；随后阶段 E 全矩阵同时段交替复测并出推荐                                   | 分层接入：vivari、Nodepod 完整适配，almostnode、burrow 只冒烟；非 WebContainer 运行时一律放独立源宿主 iframe，不注册在工作台源上；只出数据与推荐，改默认运行时另立项                                                                  |
| US-410 嵌入 Aiao Desktop | 已发布到 vscode.aiao.io（部署 `408194ed`）并通过桌面线上验收，待代码评审；以后每次发布后跑 `aiao-desktop-e2e:verify-aiao-code`                             | 桌面方需求 [ADESK-US-203](../../../aiao-desktop/requirements/stories/application/ADESK-US-203-aiao-code.md)；直接访问的启动流程不变；发布后跑 `aiao-desktop-e2e:verify-aiao-code`                                                     |

## 边界备忘

- [US-408](stories/US-408-browser-terminal.md) 承接浏览器 WebContainer 终端；US-404 的受控编译边界保留。原生扩展与任意 Nx 仓库兼容仍不承诺。
- 远端 Git（连接 / 打开 / 提交推送）已由 [US-406](stories/US-406-github-remote-repositories.md) 立项并解锁，阶段 A 进行中；真 git push（CORS 代理）、PR 创建、多人协作与 AI agent 仍不承诺，是后续独立候选。
- 应用宿主（Angular）与所编辑项目框架独立：vanilla TS / React TSX / Vue SFC / Angular standalone 四类模板都必须在 aiao-vscode 里跑通。
