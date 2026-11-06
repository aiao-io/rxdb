# Cloudflare 部署验收记录

> 当前记录对应已发布的应用源码 cd12d084；2026-11-07 的联产成本时点修复尚未重新发布，C008 已重新打开，等待新产物验收。

日期：2026-11-07。关联故事：BOM-US-002。范围为 Workers Static Assets 静态发布和 Chromium 浏览器验收。

## 实际部署

| 项目         | 记录                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------- |
| 地址         | `https://aiao-bom.aiao.workers.dev`                                                      |
| Worker       | `aiao-bom`                                                                               |
| 版本         | `c514c0c9-3b51-43ff-801e-0f3fd180f783`                                                   |
| 应用源码基线 | `cd12d084521093a249f3d8e9837fca1633160e1d`；本次新增部署回归不进入应用产物               |
| 产物目录     | `dist/apps/aiao-bom/browser`                                                             |
| 发布命令     | `pnpm nx run aiao-bom:deploy --parallel=1 --skipRemoteCache --output-style=static`       |
| 发布结果     | 39 个新资产上传成功、25 个资产复用，共 64 个发布资产；Worker 与 workers.dev 入口发布成功 |

SPA 使用 `assets.not_found_handling: single-page-application`。`public/_headers` 随构建处理，全部入口带 COOP `same-origin` 与 COEP `require-corp`。浏览器数据库标识仍为 `dev-rxdb-bom`。

## 验证证据

| 层级         | 复验入口                                                                                                                                  | 结果                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 公网红测     | `BASE_URL=https://aiao-bom.aiao.workers.dev pnpm nx run aiao-bom-e2e:e2e-cloudflare --excludeTaskDependencies --grep='首次窄屏'`          | 更新前预期失败：旧入口为禁用的「开始改版核对」，无法匹配「准备案例并开始核对」；仅诊断已部署版本，无需本地产物依赖                |
| 静态门禁     | `pnpm nx run-many --projects=aiao-bom-e2e --targets=lint,typecheck --parallel=1 --skipRemoteCache --output-style=static`                  | 34 个 Nx 任务通过；新增部署回归 lint 零警告、类型检查通过                                                                         |
| 发布预检     | `pnpm nx run aiao-bom:deploy-check --parallel=1 --skipRemoteCache --output-style=static`                                                  | 生产构建与 Wrangler dry-run 通过，无上传                                                                                          |
| 本地部署仿真 | `pnpm nx run aiao-bom-e2e:e2e-cloudflare --parallel=1 --skipRemoteCache --output-style=static`                                            | Wrangler 服务生产产物，5/5 通过，单 worker、零重试                                                                                |
| 实际公网     | `BASE_URL=https://aiao-bom.aiao.workers.dev pnpm nx run aiao-bom-e2e:e2e-cloudflare --parallel=1 --skipRemoteCache --output-style=static` | 公网 Chromium 5/5 通过，单 worker、零重试；八个入口、刷新、隔离、WASM、样本重开与计算，以及首次窄屏由主入口准备案例直达核对均通过 |
| 产物一致性   | 在全新浏览器 context 内逐个 fetch 发布文件，并用 Web Crypto 计算 SHA-256，与本地生产产物逐项比较                                          | 全部 64 个发布资产逐字节一致；首页、主脚本、图标、样式、懒加载模块与三份 SQLite WASM 均覆盖                                       |

首次窄屏回归还验证选择变化后焦点进入用量依据，返回恢复原变化行焦点，计划量保持为 10，页面不产生横向溢出。独立的新浏览器工作区显示可用的「准备案例并开始核对」入口，`crossOriginIsolated === true`。

首页 SHA-256：`f93b40cb8a20b2c2d9e2aca74e115da4bae76cfa4ce43aa5adf21aa9de087ca3`。

主脚本 SHA-256：`45d2b6d419da80381877751f8bc13186ffac47d7d005ad9dc36748fae26639b7`。

`favicon.svg` SHA-256：`227e85d89d153c804d4acb4a2b3da86451f493a876b5b74692d01d7b62869620`。

`wa-sqlite-async.wasm` SHA-256：`6bfcf02fe6c30eb05784850d985f37058475fce686cdcdc4322c8192c5a43722`。

本机日志：`/tmp/bom-public-first-run-red.log`、`/tmp/bom-public-refresh-static.log`、`/tmp/bom-public-refresh-deploy-check.log`、`/tmp/bom-public-refresh-cloudflare-local.log`、`/tmp/bom-public-refresh-deploy.log`、`/tmp/bom-public-refresh-cloudflare-remote.log`。资产清单与逐项核验结果分别保存在 `/tmp/bom-public-refresh-artifacts.json` 和 `/tmp/bom-public-refresh-artifact-verification.json`。

浏览器使用本机既有网络配置；Node HTTP 直连 workers.dev 返回过 403，部署套件统一通过浏览器请求验证。不在仓库硬编码代理或凭据。生产构建仍会报告既有的 `packages/utils` 中 `ms` CommonJS 优化提示，未压制此提示。

此前版本 `90bd7049-23cb-49e8-bd57-c252fc8bc211` 的四项部署验收是上一阶段记录；其首页 SHA-256 为 `d1b6489930dbf655fe2132051cbc228600ef471f5c71da906099cc927b423aab`。本轮先在该版本取得首次流程红测，再发布上述新版本并复验。

## 数据和发行边界

`localhost`、`workers.dev`、自定义域名各自拥有独立浏览器存储。首次打开新域名不会自动读取其他 origin 的数据；需要迁移时使用应用导出与导入，并单独核对。相同数据库名称不等于跨 origin 迁移。

本次证明 Chromium 上的真实静态部署及单人工作区，不证明 Safari、Firefox、真实企业样本、跨 origin 自动迁移、历史 schema 升级、全站离线缓存或正式发行支持。应用故事保留 In Review，等待 PR 评审与合并。
