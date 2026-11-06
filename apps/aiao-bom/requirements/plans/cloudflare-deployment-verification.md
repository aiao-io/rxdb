# Cloudflare 部署验收记录

> 当前记录对应应用源码 4b25a948，包含联产成本时点 P1 修复；2026-11-07 已重新发布，并完成本地、公网与产物一致性验收。

日期：2026-11-07。关联故事：BOM-US-002。范围为 Workers Static Assets 静态发布和 Chromium 浏览器验收。

## 实际部署

| 项目         | 记录                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------- |
| 地址         | `https://aiao-bom.aiao.workers.dev`                                                           |
| Worker       | `aiao-bom`                                                                                    |
| 版本         | `dc4b9f48-dbf1-4601-8790-88f6092c3ba5`                                                        |
| 应用源码基线 | `4b25a948804398ab16ea2a94878aa44c00e3b112`；源码树 `d6df884831ab9b6e11b7312bff6e7869424cadbb` |
| 产物目录     | `dist/apps/aiao-bom/browser`                                                                  |
| 发布命令     | `pnpm nx run aiao-bom:deploy --parallel=1 --skipRemoteCache --output-style=static`            |
| 发布结果     | 27 个新资产上传成功、37 个资产复用，共 64 个发布资产；Worker 与 workers.dev 入口发布成功      |

SPA 使用 `assets.not_found_handling: single-page-application`。`public/_headers` 随构建处理，全部入口带 COOP `same-origin` 与 COEP `require-corp`。浏览器数据库标识仍为 `dev-rxdb-bom`。

## 验证证据

| 层级             | 复验入口                                                                                                                                  | 结果                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 首次入口历史红测 | `BASE_URL=https://aiao-bom.aiao.workers.dev pnpm nx run aiao-bom-e2e:e2e-cloudflare --excludeTaskDependencies --grep='首次窄屏'`          | 首次入口更新前的历史红测：旧入口为禁用的「开始改版核对」，无法匹配「准备案例并开始核对」；本轮 P1 的四条红绿回归在双后端完整套件中通过         |
| 静态门禁         | `pnpm nx run-many --projects=aiao-bom-e2e --targets=lint,typecheck --parallel=1 --skipRemoteCache --output-style=static`                  | 34 个 Nx 任务通过；新增部署回归 lint 零警告、类型检查通过                                                                                      |
| 发布预检         | `pnpm nx run aiao-bom:deploy-check --parallel=1 --skipRemoteCache --output-style=static`                                                  | 生产构建与 Wrangler dry-run 通过，无上传                                                                                                       |
| 本地部署仿真     | `pnpm nx run aiao-bom-e2e:e2e-cloudflare --parallel=1 --skipRemoteCache --output-style=static`                                            | Wrangler 服务当前生产产物，5/5 通过（12.8s），单 worker、零重试                                                                                |
| 实际公网         | `BASE_URL=https://aiao-bom.aiao.workers.dev pnpm nx run aiao-bom-e2e:e2e-cloudflare --parallel=1 --skipRemoteCache --output-style=static` | 当前公网 Chromium 5/5 通过（21.1s），单 worker、零重试；八个入口、刷新、隔离、WASM、样本重开与计算，以及首次窄屏由主入口准备案例直达核对均通过 |
| 产物一致性       | 在全新浏览器 context 内逐个 fetch 发布文件，并用 Web Crypto 计算 SHA-256，与本地生产产物逐项比较                                          | 全部 64 个发布资产逐字节一致；首页、主脚本、图标、样式、懒加载模块与三份 SQLite WASM 均覆盖                                                    |

首次窄屏回归还验证选择变化后焦点进入用量依据，返回恢复原变化行焦点，计划量保持为 10，页面不产生横向溢出。独立的新浏览器工作区显示可用的「准备案例并开始核对」入口，`crossOriginIsolated === true`。

首页 SHA-256：`527419cd6b6959c009b48552291f943d360a47c1ee5e514d9ab9b9b2646f2de5`。

主脚本 SHA-256：`f89db3aaf4c1199834845c8d1d1512cb3033496a89dfc9c572bfc9cd921bd8b5`。

`favicon.svg` SHA-256：`227e85d89d153c804d4acb4a2b3da86451f493a876b5b74692d01d7b62869620`。

`wa-sqlite-async.wasm` SHA-256：`6bfcf02fe6c30eb05784850d985f37058475fce686cdcdc4322c8192c5a43722`。

本轮日志：`/tmp/bom-joint-public-deploy-check.log`、`/tmp/bom-joint-public-cloudflare-local.log`、`/tmp/bom-joint-public-deploy.log`、`/tmp/bom-joint-public-cloudflare-remote.log`。资产清单与真实浏览器返回的核验摘要分别保存在 `/tmp/bom-joint-public-artifacts.json` 和 `/tmp/bom-joint-public-artifact-verification.json`；每个资产 fetch 后均计算 SHA-256，64 项全部匹配。首次入口历史红测保留在 `/tmp/bom-public-first-run-red.log`。

浏览器使用本机既有网络配置；Node HTTP 直连 workers.dev 返回过 403，部署套件统一通过浏览器请求验证。不在仓库硬编码代理或凭据。生产构建仍会报告既有的 `packages/utils` 中 `ms` CommonJS 优化提示，未压制此提示。

此前版本 `c514c0c9-3b51-43ff-801e-0f3fd180f783` 对应应用源码 cd12d084，其首次入口及 64 个资产已在上一轮验收；更早版本 `90bd7049-23cb-49e8-bd57-c252fc8bc211` 留有首次入口历史红测。两者均不替代本次 4b25a948 的重新发布和复验。

## 数据和发行边界

`localhost`、`workers.dev`、自定义域名各自拥有独立浏览器存储。首次打开新域名不会自动读取其他 origin 的数据；需要迁移时使用应用导出与导入，并单独核对。相同数据库名称不等于跨 origin 迁移。

本次证明 Chromium 上的真实静态部署及单人工作区，不证明 Safari、Firefox、真实企业样本、跨 origin 自动迁移、历史 schema 升级、全站离线缓存或正式发行支持。应用故事保留 In Review，等待 PR 评审与合并。

## 来源统计优化后的产物复核

2026-11-07 将工作树来源统计优化合入工作区后，重新执行 `pnpm nx run aiao-bom:build --parallel=1 --skipRemoteCache --output-style=static`。64 个发布资产的路径集合与 SHA-256 均与上述已部署版本一致，无缺失、额外资产或哈希差异；`_headers` 控制文件也与已部署源码版本一致。沿用同一 Worker 版本及其公网验收证据，本次没有新增应用资产需要发布。证据为 `/tmp/bom-origin-app-public-equivalence-evidence.json`。
