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

## D-07：系统数据存在本地 SQLite

系统数据都存在浏览器本地的一个 RxDB 库里：磁盘的目录树与元数据、系统设置、桌面图标位置、最近使用，以及各内置应用的数据。技术栈是 `@aiao/rxdb` 加 `@aiao/rxdb-adapter-sqlite-wasm`，接法与 dev-rxdb-angular 相同：OPFS 可用时，库文件在专用 Worker 里以 OPFSCoopSyncVFS 落在 OPFS，否则用 IndexedDB。用户于 2026-11-12 拍板：用仓库自己的 RxDB 与现成插件管理全部数据，不另造存储；适配器在 sqlite-wasm 与 wa-sqlite 之间选了前者，因为它带 FTS5。

首次打开时写入内置内容，之后保留所有改动，这取代了 [ADESK-US-101](stories/desktop/ADESK-US-101-desktop-shell-baseline.md) 范围里的「不保存状态」。初始数据按数据域各写一次：每个域在一个事务里写入数据和 `seed:<domain>` 标记，要么完整写入，要么什么都没写。改了内置内容只影响新库与抹掉后的磁盘，已有的库不会被覆盖。外网内容（壁纸、地图、天气、网页）不进库（[D-04](#d-04外网内容可缺失)）。

## D-08：文件体由 storage 插件放在 OPFS

磁盘的目录树是 `@aiao/rxdb-plugin-tree` 的邻接表实体 `DesktopFile`，记录父子关系、名字、种类、大小、MIME 与修改时间。文件体交给 `@aiao/rxdb-plugin-storage`，按随机名平铺在 OPFS 的 `aiao-desktop-files/blobs/` 下，所以改名与移动只改目录树，不搬文件体。用户于 2026-11-12 在「内容也存 SQLite」和「交给 storage 插件」之间选了后者。

二进制文件能生成的做成真格式：插画渲染的 PNG / JPEG、文本 PDF、合成的 WAV；其余（视频、mp3、heic、xip、dmg、key、numbers、ttf）是带正确文件头的小占位文件。Finder 与终端显示的大小、日期都是真实值，日期是首次复制进去的时刻。磁盘工具的「抹掉」会删光文件行与文件体，再写入内置内容。

## D-09：终端按需复制磁盘

终端打开时才把磁盘复制进 Vivari（Vivari 自己的文件系统镜像也在 OPFS）。所有终端窗口与标签共用一台虚拟机，最后一个标签关掉时先把改动写回库，再拆掉虚拟机。磁盘挂在虚拟机的根目录下，主目录是 `/Users/prasenjit`，与 Vivari 自己的 `/bin`、`/tmp` 等并列。

Vivari 1.3.0 的 fs-change 事件不报虚拟机里进程自己的写入，所以终端这边的改动靠扫描发现：终端输出停下 0.3 秒后扫描一次，另外每 3 秒扫描一次，发现的改动写回库。桌面这边的改动按路径推进虚拟机，并刷新扫描基线，不会被当成终端的改动再写回来。`node_modules` 不同步，与 Vivari 自己的持久化规则一致（用户于 2026-11-12 拍板）。

自带的 `sh` 打了最小补丁：展开 `~` 与 `$NAME`，`cd` 不带参数时回主目录，在主目录时提示符显示 `~`。另外补了 `touch`、`mv`、`cp`、`open` 四个命令，`open` 把文件交给桌面上对应的应用打开。补丁对不上新版 `@vivari/core` 时直接报错，单测对仓库里安装的版本做断言。
