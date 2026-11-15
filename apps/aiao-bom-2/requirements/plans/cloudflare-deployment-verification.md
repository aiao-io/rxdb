# Cloudflare 部署验收记录

> 当前记录对应应用源码 `322bb6f0`，包含联产成本时点 P1 与虚拟件制费说明 P2 修复；2026-11-07 已重新发布，并完成本地、公网与产物一致性验收。

日期：2026-11-07。关联故事：BOM-US-002。范围为 Workers Static Assets 静态发布和 Chromium 浏览器验收。

## 实际部署

| 项目         | 记录                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------- |
| 地址         | `https://aiao-bom.aiao.workers.dev`                                                           |
| Worker       | `aiao-bom`                                                                                    |
| 版本         | `4baf9e83-d6a7-4667-90dc-9cff57827cb5`                                                        |
| 应用源码基线 | `322bb6f0a72fdd03b0ad95c77e720e3bfcd008e3`；源码树 `44337c8b4ac066ef793931665afee64bccff141b` |
| 产物目录     | `dist/apps/aiao-bom/browser`                                                                  |
| 发布命令     | `pnpm nx run aiao-bom:deploy --parallel=1 --skipRemoteCache --output-style=static`            |
| 发布结果     | 5 个新资产上传成功、59 个资产复用，共 64 个发布资产；Worker 与 workers.dev 入口发布成功       |

SPA 使用 `assets.not_found_handling: single-page-application`。`public/_headers` 随构建处理，全部入口带 COOP `same-origin` 与 COEP `require-corp`。浏览器数据库标识仍为 `dev-rxdb-bom`。

## 验证证据

| 层级         | 复验入口                                                                                                                                  | 结果                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 发布预检     | `pnpm nx run aiao-bom:deploy-check --parallel=1 --skipRemoteCache --output-style=static`                                                  | 生产构建与 Wrangler dry-run 通过，无上传                                                        |
| 生产浏览器   | `pnpm nx run aiao-bom-e2e:e2e --parallel=1 --skipRemoteCache --output-style=static`                                                       | 40/40 通过；单 worker、零重试                                                                   |
| 本地部署仿真 | `pnpm nx run aiao-bom-e2e:e2e-cloudflare --parallel=1 --skipRemoteCache --output-style=static`                                            | Wrangler 服务当前生产产物，5/5 通过（11.9s）；单 worker、零重试                                 |
| 实际公网     | `BASE_URL=https://aiao-bom.aiao.workers.dev pnpm nx run aiao-bom-e2e:e2e-cloudflare --parallel=1 --skipRemoteCache --output-style=static` | 公网 Chromium 5/5 通过（17.1s）；八个入口、刷新、隔离、WASM、样本重开与计算及首次窄屏流程均通过 |
| 产物一致性   | 在全新浏览器 context 内逐个 fetch 发布文件，用 Web Crypto 计算 SHA-256，与本地生产产物逐项比较                                            | 64 个发布资产逐字节一致；覆盖主脚本、图标、样式、懒加载模块与三份 SQLite WASM                   |

首次窄屏验收覆盖主入口准备案例并直达核对、选择变化后焦点进入用量依据、返回恢复原行焦点、计划量保持 10，以及页面无横向溢出。独立新浏览器工作区显示可用的「准备案例并开始核对」入口，`crossOriginIsolated === true`。

主脚本及五个分块路径相较上一发布有变化；Cloudflare 按内容去重，实际上传 5 个新资产。发布前后与两轮浏览器测试后的完整资产清单保持一致，未把同路径文件比较误当作全部路径比较。

首页 SHA-256：`527419cd6b6959c009b48552291f943d360a47c1ee5e514d9ab9b9b2646f2de5`。

主脚本 SHA-256：`867fcc089675d8e5d917fbcf37086b77ded99c0ef34a86ad9d15a45065fde582`。

`favicon.svg` SHA-256：`227e85d89d153c804d4acb4a2b3da86451f493a876b5b74692d01d7b62869620`。

`wa-sqlite-async.wasm` SHA-256：`6bfcf02fe6c30eb05784850d985f37058475fce686cdcdc4322c8192c5a43722`。

`_headers` 控制文件 SHA-256：`6e292754c5e0fa6e7f5091aed828329bf411730f8a471995a2733ad49843e14f`；该控制文件独立核对，不计入 64 个发布资产。

本轮日志为 `/tmp/bom-phantom-public-deploy-check.log`、`/tmp/bom-phantom-public-production-e2e.log`、`/tmp/bom-phantom-public-cloudflare-local.log`、`/tmp/bom-phantom-public-deploy.log` 和 `/tmp/bom-phantom-public-cloudflare-remote.log`。资产清单、构建差异及真实浏览器核验分别保存在 `/tmp/bom-phantom-public-artifacts.json`、`/tmp/bom-phantom-public-build-diff.json` 与 `/tmp/bom-phantom-public-artifact-verification.json`。

浏览器使用本机既有网络配置；历史 Node HTTP 直连 workers.dev 返回过 403，部署套件统一通过浏览器请求验证。不在仓库硬编码代理或凭据。生产构建保留既有 `packages/utils` 中 `ms` 的 CommonJS 优化提示。

## 修复与历史版本

本轮虚拟件成本说明回归覆盖 SQLite/PGlite 和两种发生项顺序：旧实现 2 项失败，修复后完整 BOM 套件 89 文件、1554 项通过、1 项后端条件跳过。应用成本依据直接展示修复字段；部署产物哈希证明当前公网使用本轮编译产物，不把自动化案例计为真实业务试用。

上一版本 `dc4b9f48-dbf1-4601-8790-88f6092c3ba5` 对应源码 4b25a948，包含联产时点 P1；当时本地仿真 5/5、公网 5/5、64 个资产哈希一致。来源统计优化 a5a9f7cf 的生产构建曾与该版本逐项一致。其证据为 `/tmp/bom-joint-public-artifact-verification.json` 与 `/tmp/bom-origin-app-public-equivalence-evidence.json`，不替代本次虚拟件说明修复后的重新发布。

更早版本 `c514c0c9-3b51-43ff-801e-0f3fd180f783` 对应 cd12d084，首次入口及资产曾验收；`90bd7049-23cb-49e8-bd57-c252fc8bc211` 留有首次入口历史红测。历史记录保留在 Git 与各轮证据中。

## 数据和发行边界

`localhost`、`workers.dev`、自定义域名各自拥有独立浏览器存储。首次打开新域名不会自动读取其他 origin 的数据；迁移需通过应用导出与导入，并单独核对。相同数据库名称不等于跨 origin 迁移。

本次证明 Chromium 上的真实静态部署及单人工作区。Safari、Firefox、真实企业样本、跨 origin 自动迁移、历史 schema 升级、全站离线缓存与正式发行支持仍需各自证据。应用故事保留 In Review，等待 PR 评审与合并；BOM-US-202 的真实样本试用仍未开展。
