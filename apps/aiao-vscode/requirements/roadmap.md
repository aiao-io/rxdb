# 路线图

本页回答「接下来做什么、什么必须排在什么前面」。故事状态与关闭条件见[状态概览](status-overview.md)。

## 当前任务顺序

| 工作线             | 下一步                                                                                                             | 前置与边界                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| US-404 合入与评审  | aiao-vscode 应用（工作台内核 + Angular 外壳 + e2e）过 CI 与评审后合并                                              | 故事保持 In Review；affected 门禁、三端对称为仓库级要求，本应用不再有三端绑定                          |
| 验收证据复跑       | `aiao-vscode:verify-export / verify-offline / verify-scm / verify-save-preview / verify-docking / verify-commands` | 先起 `pnpm nx serve aiao-vscode`（4320）或生产构建 + 静态服务；报告写入 `apps/aiao-vscode/benchmarks/` |
| 真实部署与公开访问 | 为生产构建选托管（COOP / COEP 响应头 + Service Worker）并公开验收                                                  | 依赖仓库级发布治理；离线与隔离边界必须在真实 origin 复验，本地 localhost 不算                          |
| 应用产品化         | 模板扩充、项目模板市场、设置持久化等按新故事立项                                                                   | 不扩展为完整 Node IDE（任意 npm / 终端 / SSR 是另一档运行时，见可行性研究）                            |

## 边界备忘

- 不立项完整 Node IDE：任意 npm / Nx 仓库、安装脚本、SSR、终端与原生扩展需要另一档运行时。
- 不承诺远端 Git（clone / fetch / push）、多人协作与 AI agent；这些是后续独立候选，不是本故事的候选 AC。
- 应用宿主（Angular）与所编辑项目框架独立：vanilla TS / React TSX / Vue SFC / Angular standalone 四类模板都必须在 aiao-vscode 里跑通。
