# Aiao Desktop 决策

## D-01：产品需求独立管理

Aiao Desktop 使用 `ADESK-US-*` / `ADESK-EPIC-*` 编号，在本目录独立统计和验收（前缀由用户于 2026-11-12 拍板）。`DESKTOP` 前缀属于另一个产品 Web Desktop，两者不共用。平台能力留在根 requirements，用 `capabilities` 引用；平台故事完成不代表本产品已接线或验收。结构门禁的校验逻辑在仓库共用的 `scripts/audit/app-requirements.mjs`，本产品只绑定自己的前缀。

## D-02：产品根目录与应用拆分

按[应用级需求与项目治理办法](../../requirements/application-governance.md)，Aiao Desktop 是多个 Nx 应用组成的一个产品，产品根放在仓库根的 `aiao-desktop/`，与 `aiao-model-design/` 同一布局。拆成两个应用：`apps/web`（Angular 桌面）与 `apps/e2e`（对正式构建跑的浏览器冒烟），两者共用前缀 `ADESK` 与本目录。组成由用户于 2026-11-12 拍板，三个选项是「web + e2e」「再并入 Web Desktop」「只放 web」；`apps/web-desktop` 是另一个产品，原地不动。

产品根保留 `aiao-desktop` 这个 Nx 项目名，承载需求门禁、安全门禁与聚合验证 `verify`；子项目名加后缀（`aiao-desktop-web`、`aiao-desktop-e2e`）。e2e 只通过 web 的构建产物验证行为，不 import web 的源码。眼下没有跨应用共用的代码，不建产品私有包；出现真实的共用需要时，按治理办法建 `@aiao-desktop/*` 私有包。

## D-03：只有前端，不带任何密钥

产品没有服务端、账号，也不调用需要授权的第三方接口，前端产物里不能出现任何密钥。`aiao-desktop:audit-secrets` 扫描 web 的构建产物，命中密钥形状即失败，只报文件与类型，不回显取值。以后要接入需要密钥的服务，先立故事加服务端应用，密钥只放服务端。

## D-04：外网内容可缺失

壁纸（Unsplash、Wikimedia）、地图瓦片（CARTO）、地名搜索（Nominatim）、天气（Open-Meteo）、Safari 阅读模式（r.jina.ai）、网站图标（DuckDuckGo）与网页字体（Google Fonts）都来自外网，且都不需要密钥。它们加载失败时应用照常打开，页面不出现错误；冒烟拦截全部外网请求来守住这一点，只放过资源加载失败的控制台信息。外网内容本身的显示效果不在当前验收范围内。

## D-05：终端依赖跨源隔离

终端用 `@vivari/core` 在页面里运行 Node、npm 与 Python，要求页面处于 `crossOriginIsolated`：托管 web 产物的服务必须返回 `Cross-Origin-Opener-Policy: same-origin` 与 `Cross-Origin-Embedder-Policy: require-corp`。开发服务器的 development 配置、`serve-static` 与冒烟里的静态服务器都带这两个响应头；production 配置的开发服务器不带。Vivari 的 worker 与运行时资源由构建从 `node_modules/@vivari/core/dist/assets` 复制到产物的 `assets/`。

## D-06：本地开发用固定端口与开发导航

本地开发统一用 `pnpm nx dev aiao-desktop` 启动，做法参考 aiao-media 的开发入口（2026-11-12 用户要求）。端口固定：Web 开发服务器 4410、正式构建预览 4411、开发导航 4412，统一登记在 `scripts/dev/services.mjs`，与仓库里多数 Angular 应用的 4200、Web Desktop 与 aiao-media 的 4300 段、aiao-model-design 的 4400 段错开。端口被占用时直接失败，不自动换号，因为导航页上的链接依赖固定地址。

产品没有服务端，开发导航由产品根的本地 Node 服务提供：只监听 `127.0.0.1`，只接受指向本机的 Host，不进入 web 的构建产物，页面里也不放任何密钥（[D-03](#d-03只有前端不带任何密钥)）。正式构建预览不随代码热更新，不随 `nx dev` 启动，需要时单独运行。
