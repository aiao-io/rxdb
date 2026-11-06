# Cloudflare 部署验收记录

日期：2026-11-06。关联故事：BOM-US-002。范围为 Workers Static Assets 静态发布和 Chromium 浏览器验收。

## 实际部署

| 项目     | 记录                                                                  |
| -------- | --------------------------------------------------------------------- |
| 地址     | `https://aiao-bom.aiao.workers.dev`                                   |
| Worker   | `aiao-bom`                                                            |
| 版本     | `90bd7049-23cb-49e8-bd57-c252fc8bc211`                                |
| 源码基线 | `44261feef1e6`，含本工作区的部署配置变更                              |
| 产物目录 | `dist/apps/aiao-bom/browser`                                          |
| 发布命令 | `pnpm nx run aiao-bom:deploy --skipRemoteCache --output-style=static` |
| 发布结果 | 63 个静态文件上传成功，Worker 与 workers.dev 入口发布成功             |

SPA 使用 `assets.not_found_handling: single-page-application`。`public/_headers` 随构建复制，全部入口带 COOP `same-origin` 与 COEP `require-corp`。不部署 Node 服务或业务数据，浏览器数据库标识仍为 `dev-rxdb-bom`。

## 验证证据

| 层级         | 复验入口                                                                                                                                                                           | 结果                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 红测         | 部署专项用例访问既有普通静态服务器                                                                                                                                                 | 首页 200，但 COOP 缺失，验收按预期失败                                                                            |
| 本地工程门禁 | `pnpm nx run-many --projects=aiao-bom,aiao-bom-e2e --targets=lint,typecheck,test,e2e,e2e-cloudflare,deploy-check --parallel=1 --skipRemoteCache --output-style=static`             | 43 个 Nx 任务通过；单测 25 文件、224/224；业务 E2E 39/39；部署专项 4/4；lint 零警告、类型检查及发布预检通过       |
| 本地部署仿真 | `pnpm nx run aiao-bom-e2e:e2e-cloudflare`                                                                                                                                          | Wrangler 静态产物浏览器验收 4/4，单 worker、零重试                                                                |
| 实际公网     | `BASE_URL=https://aiao-bom.aiao.workers.dev pnpm nx run-many --projects=aiao-bom-e2e --targets=lint,typecheck,e2e-cloudflare --parallel=1 --skipRemoteCache --output-style=static` | 36 个 Nx 任务通过；公网 Chromium 4/4，单 worker、零重试；八个页面入口、刷新、隔离、WASM、样本重开与改版计算均通过 |
| 产物一致性   | 下载实际首页和 SQLite WASM，对比本地生产产物 SHA-256                                                                                                                               | 两文件均逐字节一致                                                                                                |

首页 SHA-256：`d1b6489930dbf655fe2132051cbc228600ef471f5c71da906099cc927b423aab`。

`wa-sqlite-async.wasm` SHA-256：`6bfcf02fe6c30eb05784850d985f37058475fce686cdcdc4322c8192c5a43722`。

本机完整日志：`/tmp/aiao-bom-cloudflare-red.log`、`/tmp/aiao-bom-cloudflare-gate.log`、`/tmp/aiao-bom-cloudflare-deploy.log`、`/tmp/aiao-bom-cloudflare-public.log`。常规复验命令不需要本机网络配置；本机 Chromium 使用系统网络代理，Node HTTP 直连 workers.dev 曾超时。部署套件统一通过浏览器请求验证，与访问者的实际加载路径一致；不在仓库硬编码代理或凭据。

生产构建保留了本轮之前已存在的 `packages/utils` 中 `ms` CommonJS 优化提示；没有压制或扩大到共享包修改。该提示在上一轮应用化构建日志中同样存在。

## 数据和发行边界

`localhost`、`workers.dev`、自定义域名各自拥有独立浏览器存储。首次打开新域名不会自动读取其他 origin 的数据；需要迁移时使用应用导出与导入，并单独核对。相同数据库名称不等于跨 origin 迁移。

本次证明 Chromium 上的真实静态部署及单人工作区，不证明 Safari、Firefox、真实企业样本、跨 origin 自动迁移、历史 schema 升级、全站离线缓存或正式发行支持。应用故事保留 In Review，等待 PR 评审与合并。
