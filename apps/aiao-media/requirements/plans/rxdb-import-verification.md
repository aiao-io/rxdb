# RxDB 同仓迁入验收

Aiao Media 已导入 RxDB 的 `codex/aiao-media-incubation` 分支。应用专属文件位于 `apps/aiao-media`，e2e 位于 `apps/aiao-media-e2e`。生产发布入口尚未切换。

## 来源与结构

- 原仓基线：`43bc9eeb696c4b3c4c51351724d2fe91f0f8e8f3`；目标仓起点：`23d8a098c0ca348b451cf19c7fa1bc127f7a80db`。
- [导入清单](source-import.json)记录原 tracked 文件与本次确认的迁移方案的 SHA-256、去向及整合方式。旧仓保留完整历史。
- 只有应用与 e2e 两个 Nx 项目；`src/contracts`、`src/local-data`、`infra/supabase` 均为普通文件夹。
- 应用使用 pnpm、Angular 22.2.3 与工作区 RxDB 0.0.28。数据层、备份版本、profile key、数据库名、OPFS 路径及 Compose 项目／卷身份保留。
- 原 11 条 story 保留状态，使用 `MEDIA-US-*`，以 `legacyId` 关联原编号；平台故事使用原编号，分别统计。私有目录和需求检查归属应用，脚本测试由应用常规 test target 执行。

## 复验入口与证据

在仓库根使用 Node >=26、pnpm 10，Nx Cloud 保持关闭。下面记录本次在迁入目录执行的结果。

| 命令／套件                       | 结果                | 验证边界                                                                                       |
| -------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| 应用和 e2e 的 lint / typecheck   | 通过                | 包含归入应用的契约、数据层及单测类型检查                                                       |
| `aiao-media:test`                | 193 项单测通过      | 16 个测试文件，包含原三个项目的业务单测                                                        |
| `aiao-media:requirements-check`  | 16 项检查器测试通过 | 校验应用隔离、平台能力引用、故事状态与链接                                                     |
| `aiao-media:script-test`         | 13 项通过           | 原图资源完整性、原故事状态、目录组织、代理与公开账号配置                                       |
| `aiao-media-e2e:local-first-e2e` | 27 项通过           | 真实 Chrome、RxDB、WASM、IndexedDB、OPFS、Service Worker；供应商与该套件账号使用 fixture       |
| `aiao-media-e2e:upgrade-e2e`     | 1 项通过            | 旧 0.0.26 构建在相同 origin 写入草稿、供应商、真实原图后切换新构建，回读、精确下载并导入旧备份 |
| `aiao-media:supabase-test`       | 通过                | 真实本地 Auth、邮箱确认、RLS/Realtime 开发探针、刷新与退出                                     |
| `aiao-media:supabase-e2e`        | 3 项通过            | 真实本地账号浏览器场景；不代表产品绑定与多设备同步                                             |
| `aiao-media:deploy-check`        | 通过                | 本地产物检查和 Wrangler dry-run，不发布                                                        |

补充检查：直连探针 6 项通过，平台脚本 451 项通过，所依赖的四个底层项目 lint 通过。平台需求审计维持 103 条，应用 11 条独立统计；`nx sync:check` 通过。

升级用例的旧构建来自原仓基线，用原仓 `web:offline-assets` 构建，测试时通过 `AIAO_MEDIA_BASELINE` 指向其 browser 目录。同一浏览器 origin、同一 profile，旧原图来自 fixture；Service Worker 在该专项套件中禁用，离线行为由常规 27 项套件覆盖。该证据只覆盖当前 0.0.26 基线，不宣称支持任意历史库。

## 配置整合

原跨仓 `link-rxdb` 脚本和其专用测试由 `workspace:*` 依赖与 Nx 构建前置替代。原业务测试和设计资源保留；迁移完整性测试对二进制资源逐个核对来源摘要。

契约测试合并后暴露了一个原音频测试的参数化写法问题：数组被 Vitest 当作多个参数展开。现改为对象包裹数组，使测试实际验证完整的候选目录，同时通过类型检查。类成员按目标仓 ESLint 规则排序，原有功能不变。

GitHub Actions 使用目标仓现有环境安装 action 与固定 SHA；产品逻辑留在应用 targets／脚本内。PR 执行验证，发布由手动 workflow_dispatch 选择并受 production environment 管理。

## 仍保留的产品待验项

正式供应商三画幅出图、正式域名、桌面真实 OS 中文输入法及正式发布回退仍以原 story AC 为准。本次迁入没有发布生产环境，也没有将账号绑定、多设备复制或业务后台改成已完成。平台 API 和 packages 源码未随应用业务改动。
